/**
 * Seed test data for the newsfeed forum-posts/comments/likes feature.
 *
 * Forum posts themselves are never stored locally (they're a live read-through
 * of NodeBB), so this only seeds the two directory-native tables:
 *   - FeedComment  — a couple of comments on the most recent live NodeBB
 *     topics (fetched from FORUM_API_URL/api/recent, as fp_<tid>) and on the
 *     most recent TeamNewsItem rows already in this DB.
 *   - FeedForumPostLike — a few likes on those same forum-post uids.
 *
 * Idempotent: skips a comment if the same (itemUid, authorUid, text) already
 * exists; likes upsert on the (forumPostUid, memberUid) unique constraint.
 *
 * Run via `yarn api:seed-feed`. Requires at least 2 seeded Members and,
 * for the forum-post half, a reachable FORUM_API_URL (falls back to
 * news-item-only seed data with a warning if NodeBB isn't reachable).
 */
import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FeedTarget {
  uid: string;
  title: string;
}

async function fetchRecentForumPosts(count: number): Promise<FeedTarget[]> {
  const forumApiUrl = process.env.FORUM_API_URL;
  if (!forumApiUrl) {
    console.warn('FORUM_API_URL not set — skipping forum-post seed data (comments/likes on fp_* uids).');
    return [];
  }
  try {
    const response = await axios.get(`${forumApiUrl}/api/recent`);
    const topics = Array.isArray(response.data?.topics) ? response.data.topics : [];
    return topics
      .slice(0, count)
      .map((t: any) => ({ uid: `fp_${t.tid}`, title: t.titleRaw ?? t.title ?? `topic ${t.tid}` }));
  } catch (err) {
    console.warn(`Could not reach ${forumApiUrl}/api/recent — skipping forum-post seed data.`, (err as Error).message);
    return [];
  }
}

async function fetchRecentNewsItems(count: number): Promise<FeedTarget[]> {
  return prisma.teamNewsItem.findMany({
    orderBy: { eventDate: 'desc' },
    take: count,
    select: { uid: true, title: true },
  });
}

async function pickMemberUids(count: number): Promise<string[]> {
  const members = await prisma.member.findMany({
    orderBy: { createdAt: 'asc' },
    take: count,
    select: { uid: true },
  });
  return members.map((m) => m.uid);
}

async function seedComment(itemType: 'NEWS' | 'FORUM_POST', itemUid: string, authorUid: string, text: string) {
  const existing = await prisma.feedComment.findFirst({ where: { itemUid, authorUid, text } });
  if (existing) return { row: existing, created: false };
  const row = await prisma.feedComment.create({ data: { itemType, itemUid, authorUid, text } });
  return { row, created: true };
}

async function seedLike(forumPostUid: string, memberUid: string) {
  return prisma.feedForumPostLike.upsert({
    where: { forumPostUid_memberUid: { forumPostUid, memberUid } },
    create: { forumPostUid, memberUid },
    update: {},
  });
}

async function main() {
  const members = await pickMemberUids(6);
  if (members.length < 2) {
    console.error('Need at least 2 seeded Members to create feed comments/likes — seed members first.');
    process.exit(1);
  }

  const forumPosts = await fetchRecentForumPosts(2);
  const newsItems = await fetchRecentNewsItems(2);

  console.log(`Members available: ${members.length}`);
  console.log(`Forum posts: ${forumPosts.map((f) => `${f.uid} (${f.title})`).join(', ') || '(none)'}`);
  console.log(`News items: ${newsItems.map((n) => `${n.uid} (${n.title})`).join(', ') || '(none found)'}`);

  let commentsCreated = 0;
  let likesUpserted = 0;

  for (const [index, post] of forumPosts.entries()) {
    const firstAuthor = members[index % members.length];
    const secondAuthor = members[(index + 1) % members.length];

    const c1 = await seedComment('FORUM_POST', post.uid, firstAuthor, `Great write-up on "${post.title}" — thanks for sharing!`);
    if (c1.created) commentsCreated++;

    if (secondAuthor !== firstAuthor) {
      const c2 = await seedComment('FORUM_POST', post.uid, secondAuthor, 'Following this thread, curious how it plays out.');
      if (c2.created) commentsCreated++;
    }

    for (const liker of members.slice(0, 3)) {
      await seedLike(post.uid, liker);
      likesUpserted++;
    }
  }

  for (const [index, item] of newsItems.entries()) {
    const author = members[(index + 2) % members.length];
    const { created } = await seedComment('NEWS', item.uid, author, `Congrats on this — "${item.title}" is exciting news!`);
    if (created) commentsCreated++;
  }

  const totalComments = await prisma.feedComment.count();
  const totalLikes = await prisma.feedForumPostLike.count();

  console.log('\n— Feed seed complete —');
  console.log(`comments created this run: ${commentsCreated} (total in DB: ${totalComments})`);
  console.log(`likes upserted this run: ${likesUpserted} (total in DB: ${totalLikes})`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

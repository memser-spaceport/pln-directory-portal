/**
 * Seed test data for the Feed News comments/replies/likes feature.
 *
 * Forum posts are never stored locally (they're a live read-through of
 * NodeBB) and neither FeedComment nor FeedNewsLike ever reference them —
 * both tables are Feed News (TeamNewsItem) only. This seeds:
 *   - FeedComment — a top-level comment plus a reply thread (parentUid) on
 *     the most recent TeamNewsItem rows already in this DB.
 *   - FeedNewsLike — a few likes on those same news items.
 *
 * Idempotent: skips a comment if the same (newsItemUid, authorUid, text)
 * already exists; likes upsert on the (newsItemUid, memberUid) unique
 * constraint.
 *
 * Run via `yarn api:seed-feed`. Requires at least 2 seeded Members and at
 * least 1 seeded TeamNewsItem.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface FeedTarget {
  uid: string;
  title: string;
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

async function seedComment(newsItemUid: string, authorUid: string, text: string, parentUid: string | null = null) {
  const existing = await prisma.feedComment.findFirst({ where: { newsItemUid, authorUid, text } });
  if (existing) return { row: existing, created: false };
  const row = await prisma.feedComment.create({ data: { newsItemUid, authorUid, text, parentUid } });
  return { row, created: true };
}

async function seedLike(newsItemUid: string, memberUid: string) {
  return prisma.feedNewsLike.upsert({
    where: { newsItemUid_memberUid: { newsItemUid, memberUid } },
    create: { newsItemUid, memberUid },
    update: {},
  });
}

async function main() {
  const members = await pickMemberUids(6);
  if (members.length < 2) {
    console.error('Need at least 2 seeded Members to create feed comments/likes — seed members first.');
    process.exit(1);
  }

  const newsItems = await fetchRecentNewsItems(2);
  console.log(`Members available: ${members.length}`);
  console.log(`News items: ${newsItems.map((n) => `${n.uid} (${n.title})`).join(', ') || '(none found)'}`);

  if (newsItems.length === 0) {
    console.error('Need at least 1 TeamNewsItem to seed feed comments/likes — seed team news first.');
    process.exit(1);
  }

  let commentsCreated = 0;
  let likesUpserted = 0;

  for (const [index, item] of newsItems.entries()) {
    const firstAuthor = members[index % members.length];
    const secondAuthor = members[(index + 1) % members.length];

    const root = await seedComment(item.uid, firstAuthor, `Congrats on this — "${item.title}" is exciting news!`);
    if (root.created) commentsCreated++;

    if (secondAuthor !== firstAuthor) {
      const reply = await seedComment(item.uid, secondAuthor, 'Agreed, following this closely.', root.row.uid);
      if (reply.created) commentsCreated++;
    }

    for (const liker of members.slice(0, 3)) {
      await seedLike(item.uid, liker);
      likesUpserted++;
    }
  }

  const totalComments = await prisma.feedComment.count();
  const totalLikes = await prisma.feedNewsLike.count();

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

/**
 * Local OpenSearch Sync Script
 *
 * Syncs data from local PostgreSQL and MongoDB to local OpenSearch.
 * Run with: npx ts-node scripts/opensearch-local-sync.ts
 *
 * Or add to package.json scripts:
 *   "opensearch:sync": "ts-node scripts/opensearch-local-sync.ts"
 */

import { Client } from '@opensearch-project/opensearch';
import { PrismaClient } from '@prisma/client';
import { MongoClient } from 'mongodb';

const OPENSEARCH_URL = process.env.OPENSEARCH_LOCAL_ENDPOINT || 'http://localhost:9200';
const MONGO_URI = process.env.MONGO_FORUM_URI || 'mongodb://admin:secretpassword@127.0.0.1:27017/nodebb?authSource=admin';
const MONGO_DB_NAME = process.env.MONGO_FORUM_DB || 'nodebb';
const FORUM_BASE_URL = process.env.FORUM_BASE_URL || 'http://localhost:4567';

const prisma = new PrismaClient();
const osClient = new Client({ node: OPENSEARCH_URL });

function generateSuggestInput(text: string | null): string[] {
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  return Array.from(new Set([text, ...tokens]));
}

function stripHtml(s: string | null): string {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

async function ensureIndex(index: string, mappings: any) {
  try {
    const exists = await osClient.indices.exists({ index });
    if (!exists.body) {
      await osClient.indices.create({ index, body: { mappings } });
      console.log(`Created index: ${index}`);
    } else {
      console.log(`Index exists: ${index}`);
    }
  } catch (err: any) {
    if (err?.meta?.body?.error?.type !== 'resource_already_exists_exception') {
      console.error(`Error creating index ${index}:`, err.message);
    }
  }
}

async function syncMembers() {
  console.log('\n--- Syncing Members ---');

  const members = await prisma.member.findMany({
    where: {
      accessLevel: { notIn: ['L0', 'L1', 'Rejected'] }
    },
    include: {
      image: true
    }
  });

  console.log(`Found ${members.length} members to sync`);
  if (members.length === 0) return 0;

  const body = members.flatMap(m => [
    { index: { _index: 'member', _id: m.uid } },
    {
      uid: m.uid,
      name: m.name,
      image: m.image?.url || null,
      bio: stripHtml(m.bio),
      scheduleMeetingCount: m.scheduleMeetingCount || 0,
      officeHoursUrl: m.officeHours || null,
      availableToConnect: Boolean(m.officeHours),
      name_suggest: { input: generateSuggestInput(m.name) }
    }
  ]);

  const resp = await osClient.bulk({ body, refresh: true });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter((x: any) => x.index?.error);
    console.error(`Member sync errors: ${failed.length}`);
  }

  console.log(`Synced ${members.length} members`);
  return members.length;
}

async function syncTeams() {
  console.log('\n--- Syncing Teams ---');

  const teams = await prisma.team.findMany({
    where: {
      accessLevel: { notIn: ['L0', 'Rejected'] }
    },
    include: {
      logo: true
    }
  });

  console.log(`Found ${teams.length} teams to sync`);
  if (teams.length === 0) return 0;

  const body = teams.flatMap(t => [
    { index: { _index: 'team', _id: t.uid } },
    {
      uid: t.uid,
      name: t.name,
      image: t.logo?.url || null,
      shortDescription: t.shortDescription,
      longDescription: stripHtml(t.longDescription),
      name_suggest: { input: generateSuggestInput(t.name) },
      shortDescription_suggest: { input: generateSuggestInput(t.shortDescription) }
    }
  ]);

  const resp = await osClient.bulk({ body, refresh: true });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter((x: any) => x.index?.error);
    console.error(`Team sync errors: ${failed.length}`);
  }

  console.log(`Synced ${teams.length} teams`);
  return teams.length;
}

async function syncProjects() {
  console.log('\n--- Syncing Projects ---');

  const projects = await prisma.project.findMany({
    where: {
      isDeleted: false
    },
    include: {
      logo: true
    }
  });

  console.log(`Found ${projects.length} projects to sync`);
  if (projects.length === 0) return 0;

  const body = projects.flatMap(p => [
    { index: { _index: 'project', _id: p.uid } },
    {
      uid: p.uid,
      name: p.name,
      image: p.logo?.url || null,
      tagline: p.tagline,
      description: stripHtml(p.description),
      readMe: p.readMe,
      tags: p.tags || [],
      name_suggest: { input: generateSuggestInput(p.name) },
      tagline_suggest: { input: generateSuggestInput(p.tagline) },
      tags_suggest: { input: p.tags || [] }
    }
  ]);

  const resp = await osClient.bulk({ body, refresh: true });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter((x: any) => x.index?.error);
    console.error(`Project sync errors: ${failed.length}`);
  }

  console.log(`Synced ${projects.length} projects`);
  return projects.length;
}

async function syncEvents() {
  console.log('\n--- Syncing Events ---');

  const events = await prisma.pLEvent.findMany({
    include: {
      logo: true,
      location: true
    }
  });

  console.log(`Found ${events.length} events to sync`);
  if (events.length === 0) return 0;

  const body = events.flatMap(e => [
    { index: { _index: 'event', _id: e.uid } },
    {
      uid: e.uid,
      name: e.name?.trim() || '',
      image: e.logo?.url || null,
      description: stripHtml(e.description),
      additionalInfo: e.additionalInfo ? JSON.stringify(e.additionalInfo) : null,
      shortDescription: e.shortDescription,
      location: e.location?.location || null,
      slug: e.slugURL || null,
      eventUrl: e.slugURL ? `https://events.plnetwork.io/program/#${e.slugURL}` : null,
      name_suggest: { input: generateSuggestInput(e.name) },
      shortDescription_suggest: { input: generateSuggestInput(e.shortDescription) },
      location_suggest: { input: generateSuggestInput(e.location?.location || null) }
    }
  ]);

  const resp = await osClient.bulk({ body, refresh: true });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter((x: any) => x.index?.error);
    console.error(`Event sync errors: ${failed.length}`);
  }

  console.log(`Synced ${events.length} events`);
  return events.length;
}

async function syncForumThreads(): Promise<number> {
  console.log('\n--- Syncing Forum Threads (MongoDB) ---');

  let mongoClient: MongoClient | null = null;

  try {
    mongoClient = new MongoClient(MONGO_URI);
    await mongoClient.connect();
    const db = mongoClient.db(MONGO_DB_NAME);
    const coll = db.collection('objects');

    console.log(`Connected to MongoDB: ${MONGO_DB_NAME}`);

    // Get all topics
    const topics = await coll.find({ _key: /^topic:\d+$/ }).toArray();
    console.log(`Found ${topics.length} topics`);

    if (topics.length === 0) {
      return 0;
    }

    const body: any[] = [];
    let synced = 0;

    for (const topic of topics) {
      const tid = parseInt(topic._key.split(':')[1], 10);
      const topicTitle = topic.title || '';
      const topicSlug = topic.slug || null;
      const topicCid = topic.cid ?? null;

      // Get category for URL
      let categorySlug: string | null = null;
      if (topicCid != null) {
        const category = await coll.findOne({ _key: `category:${topicCid}` });
        categorySlug = category?.slug || null;
      }

      const topicUrl = topicSlug ? `${FORUM_BASE_URL}/topic/${topicSlug}` : null;

      // Get all posts for this topic
      const posts = await coll.aggregate([
        { $match: { _key: /^post:\d+$/ } },
        { $addFields: {
            pid: { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
            tidInt: { $cond: [{ $isNumber: '$tid' }, '$tid', { $toInt: '$tid' }] }
          }
        },
        { $match: { tidInt: tid, $or: [{ deleted: { $exists: false } }, { deleted: false }, { deleted: 0 }] } },
        { $sort: { pid: 1 } }
      ]).toArray();

      if (posts.length === 0) continue;

      // Get user info for each post
      const postsWithAuthors: any[] = await Promise.all(posts.map(async (post: any) => {
        const user = await coll.findOne({ _key: `user:${post.uid}` });
        return {
          pid: post.pid,
          uid: post.uid,
          content: post.content,
          timestamp: post.timestamp,
          author: {
            name: user?.fullname || user?.username || null,
            username: user?.username || null,
            slug: user?.userslug || null,
            image: user?.picture ?? user?.uploadedpicture ?? null
          }
        };
      }));

      const first = postsWithAuthors[0];
      const firstPid = first.pid;

      const toDate = (ts: any) => {
        if (ts == null) return null;
        const n = Number(ts);
        if (!Number.isFinite(n)) return null;
        const ms = n >= 1000000000000 ? n : (n >= 1000000000 ? n * 1000 : null);
        return ms ? new Date(ms) : null;
      };

      const rootPost = {
        pid: first.pid,
        uidAuthor: first.uid ?? null,
        author: first.author,
        timestamp: toDate(first.timestamp),
        url: topicUrl,
        content: stripHtml(first.content),
        cid: topicCid
      };

      const replies = postsWithAuthors.slice(1).map(p => ({
        pid: p.pid,
        uidAuthor: p.uid ?? null,
        author: p.author,
        timestamp: toDate(p.timestamp),
        url: topicUrl ? `${topicUrl}#pid${p.pid}` : null,
        content: stripHtml(p.content),
        cid: topicCid
      }));

      const doc = {
        uid: String(tid),
        tid,
        cid: topicCid,
        topicTitle,
        topicSlug,
        topicUrl,
        categorySlug,
        rootPost,
        replies,
        replyCount: replies.length,
        lastReplyAt: replies.length ? replies[replies.length - 1].timestamp : rootPost.timestamp,
        name: topicTitle || (rootPost.content || '').slice(0, 80),
        image: null,
        name_suggest: { input: generateSuggestInput(topicTitle) }
      };

      body.push({ index: { _index: 'forum_thread', _id: String(tid) } });
      body.push(doc);
      synced++;
    }

    if (body.length > 0) {
      const resp = await osClient.bulk({ body, refresh: true });
      if (resp.body?.errors) {
        const failed = resp.body.items.filter((x: any) => x.index?.error);
        console.error(`Forum sync errors: ${failed.length}`);
        if (failed.length > 0) {
          console.error('Sample error:', JSON.stringify(failed[0], null, 2));
        }
      }
    }

    console.log(`Synced ${synced} forum threads`);
    return synced;

  } catch (err: any) {
    console.error('Forum sync failed:', err.message);
    return 0;
  } finally {
    if (mongoClient) {
      await mongoClient.close();
    }
  }
}

async function main() {
  console.log('===========================================');
  console.log('OpenSearch Local Sync');
  console.log('===========================================');
  console.log(`OpenSearch: ${OPENSEARCH_URL}`);
  console.log(`PostgreSQL: ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ':***@')}`);
  console.log(`MongoDB:    ${MONGO_URI.replace(/:[^:@]+@/, ':***@')}`);

  // Check OpenSearch connection
  try {
    const info = await osClient.info();
    console.log(`OpenSearch version: ${info.body.version.number}`);
  } catch (err: any) {
    console.error('Failed to connect to OpenSearch:', err.message);
    console.error('Make sure OpenSearch is running: docker ps | grep opensearch');
    process.exit(1);
  }

  // Run setup script first if indices don't exist
  console.log('\nChecking indices...');

  const members = await syncMembers();
  const teams = await syncTeams();
  const projects = await syncProjects();
  const events = await syncEvents();
  const forumThreads = await syncForumThreads();

  console.log('\n===========================================');
  console.log('Sync Complete!');
  console.log('===========================================');
  console.log(`Members:       ${members}`);
  console.log(`Teams:         ${teams}`);
  console.log(`Projects:      ${projects}`);
  console.log(`Events:        ${events}`);
  console.log(`Forum Threads: ${forumThreads}`);
  console.log(`Total:         ${members + teams + projects + events + forumThreads}`);

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Sync failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});

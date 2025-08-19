import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import sanitizeHtml from 'sanitize-html';

const ssm = new SSMClient({});
const CHECKPOINT_PATH = process.env.CHECKPOINT_PATH;
const CHECKPOINT_FORUM_PATH = process.env.CHECKPOINT_FORUM_PATH;
const PG_PORT = process.env.PG_PORT;
const OS_REGION = process.env.OS_REGION;
const OS_SERVICE = process.env.OS_SERVICE;
const OS_HOST = process.env.OS_HOST;
const FORUM_BASE_URL = process.env.FORUM_BASE_URL || 'https://forum.example.com';
const MONGO_URI = process.env.MONGO_URI;
const MONGO_URI_PARAM = process.env.MONGO_URI_PARAM;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'nodebb';

let pgPool;
let pgClient;
let mongoClient;
let mongoDb;

const osClient = new Client({
  ...AwsSigv4Signer({ region: OS_REGION, service: OS_SERVICE, getCredentials: defaultProvider() }),
  node: OS_HOST
});

async function getParameter(name, withDecryption = true) {
  const cmd = new GetParameterCommand({ Name: name, WithDecryption: withDecryption });
  const res = await ssm.send(cmd);
  return res.Parameter.Value;
}

async function getLastCheckpoint() {
  try {
    return getParameter(CHECKPOINT_PATH, false);
  } catch (err) {
    if (err.name === 'ParameterNotFound') return '1970-01-01T00:00:00Z';
    throw err;
  }
}

async function getForumCheckpoint() {
  if (!CHECKPOINT_FORUM_PATH) return null;
  try {
    return await getParameter(CHECKPOINT_FORUM_PATH, false);
  } catch (err) {
    if (err.name === 'ParameterNotFound') return '1970-01-01T00:00:00Z';
    console.warn('Forum checkpoint read failed:', err?.message || err);
    return null;
  }
}

async function updateCheckpoint(newTimestamp) {
  await ssm.send(new PutParameterCommand({
    Name: CHECKPOINT_PATH,
    Value: newTimestamp.toISOString(),
    Type: 'String',
    Overwrite: true
  }));
}

async function updateForumCheckpoint(newTimestamp) {
  if (!CHECKPOINT_FORUM_PATH) return;
  try {
    await ssm.send(new PutParameterCommand({
      Name: CHECKPOINT_FORUM_PATH,
      Value: newTimestamp.toISOString(),
      Type: 'String',
      Overwrite: true
    }));
    console.log('Forum checkpoint updated ->', newTimestamp.toISOString());
  } catch (err) {
    console.warn('Forum checkpoint update failed:', err?.message || err);
  }
}

async function initPgPool() {
  if (!pgPool) {
    const [host, user, database, password] = await Promise.all([
      getParameter(process.env.PG_HOST, false),
      getParameter(process.env.PG_USER),
      getParameter(process.env.PG_DBNAME),
      getParameter(process.env.PG_PASSWORD)
    ]);
    pgPool = new Pool({
      host,
      user,
      database,
      password,
      port: parseInt(PG_PORT, 10),
      ssl: { rejectUnauthorized: false },
      max: 2
    });
  }
  if (!pgClient) pgClient = await pgPool.connect();
}

async function resolveMongoUri() {
  if (MONGO_URI) return MONGO_URI;
  if (MONGO_URI_PARAM) {
    try {
      return await getParameter(MONGO_URI_PARAM, true);
    } catch (err) {
      console.warn('Mongo URI fetch failed:', err?.message || err);
      return null;
    }
  }
  return null;
}

async function initMongo() {
  if (mongoDb) return mongoDb;
  const uri = await resolveMongoUri();
  if (!uri) return null;
  try {
    if (!mongoClient) {
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 8000, maxPoolSize: 2 });
      await mongoClient.connect();
    }
    mongoDb = mongoClient.db(MONGO_DB_NAME);
    return mongoDb;
  } catch (err) {
    console.warn('Mongo connect failed:', err?.message || err);
    return null;
  }
}

async function getMaxTimestampForTable(pgClient, table) {
  const q = `
    SELECT GREATEST(
             COALESCE(MAX("createdAt"), 'epoch'),
             COALESCE(MAX("updatedAt"), 'epoch')
           ) AS max_timestamp
    FROM ${table}
  `;
  const r = await pgClient.query(q);
  return r.rows[0].max_timestamp;
}

async function getMaxTimestamp() {
  const ts = await Promise.all([
    getMaxTimestampForTable(pgClient, '"Member"'),
    getMaxTimestampForTable(pgClient, '"Team"'),
    getMaxTimestampForTable(pgClient, '"Project"'),
    getMaxTimestampForTable(pgClient, '"PLEvent"')
  ]);
  let max = null;
  for (const t of ts) {
    if (!t) continue;
    if (!max || t > max) max = t;
  }
  return max;
}

function generateSuggestInput(text) {
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  return Array.from(new Set([text, ...tokens]));
}

function purifyHtml(html) {
  const without = sanitizeHtml(html, { allowedTags: [], allowedAttributes: [] });
  return without.replaceAll('&nbsp;', ' ');
}

function stripHtml(s) {
  if (!s) return '';
  return s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function newerCheckpointFound(lastCheckpoint, maxTimestamp) {
  const a = new Date(maxTimestamp);
  const b = new Date(lastCheckpoint);
  return a && a > b;
}

async function deleteRejectedMembersFromOpenSearch() {
  const r = await pgClient.query(`SELECT uid FROM "Member" WHERE "accessLevel" IN ('Rejected', 'L0', 'L1')`);
  const uids = r.rows.map(x => x.uid);
  if (!uids.length) return;
  const body = uids.flatMap(uid => [{ delete: { _index: 'member', _id: uid } }]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => (x.delete && x.delete.error) || (x.index && x.index.error));
    console.error('Member deletes failed:', JSON.stringify(failed.slice(0, 10), null, 2));
  } else {
    console.log(`Deleted ${uids.length} rejected/L0/L1 members`);
  }
}

async function deleteDeletedProjectsFromOpenSearch() {
  const r = await pgClient.query(`SELECT uid FROM "Project" WHERE "isDeleted" = true`);
  const uids = r.rows.map(x => x.uid);
  if (!uids.length) return;
  const body = uids.flatMap(uid => [{ delete: { _index: 'project', _id: uid } }]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => (x.delete && x.delete.error) || (x.index && x.index.error));
    console.error('Project deletes failed:', JSON.stringify(failed.slice(0, 10), null, 2));
  } else {
    console.log(`Deleted ${uids.length} deleted projects`);
  }
}

async function indexMembers(lastCheckpoint) {
  const r = await pgClient.query(`
    SELECT m.uid, m.name, m.bio, i.url
    FROM "Member" m
           LEFT JOIN "Image" i ON m."imageUid" = i.uid
    WHERE (m."createdAt" > $1 OR m."updatedAt" > $1)
      AND m."accessLevel" NOT IN ('L0', 'L1', 'Rejected')
  `, [lastCheckpoint]);
  console.log('Got data from Member table:', r.rows.length);
  if (!r.rows.length) return 0;

  const body = r.rows.flatMap(row => [
    { index: { _index: 'member', _id: row.uid } },
    { uid: row.uid, name: row.name, image: row.url, bio: purifyHtml(row.bio), name_suggest: { input: generateSuggestInput(row.name) } }
  ]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => x.index && x.index.error);
    console.error('Member bulk errors:', JSON.stringify(failed.slice(0, 10), null, 2));
    return 0;
  }
  return r.rows.length;
}

async function indexTeams(lastCheckpoint) {
  const r = await pgClient.query(`
    SELECT t.uid, t.name, t."shortDescription", t."longDescription", i.url
    FROM "Team" t
           LEFT JOIN "Image" i ON t."logoUid" = i.uid
    WHERE t."createdAt" > $1 OR t."updatedAt" > $1
  `, [lastCheckpoint]);
  console.log('Got data from Team table:', r.rows.length);
  if (!r.rows.length) return 0;

  const body = r.rows.flatMap(row => [
    { index: { _index: 'team', _id: row.uid } },
    {
      uid: row.uid,
      name: row.name,
      image: row.url,
      shortDescription: row.shortDescription,
      longDescription: purifyHtml(row.longDescription),
      name_suggest: { input: generateSuggestInput(row.name) },
      shortDescription_suggest: { input: generateSuggestInput(row.shortDescription) }
    }
  ]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => (x.index && x.index.error) || (x.delete && x.delete.error));
    console.error('Team bulk errors:', JSON.stringify(failed.slice(0, 10), null, 2));
  }
  return r.rows.length;
}

async function indexProjects(lastCheckpoint) {
  const r = await pgClient.query(`
    SELECT p.uid, p.name, p.tagline, p.description, p."readMe", p.tags, i.url
    FROM "Project" p
           LEFT JOIN "Image" i ON p."logoUid" = i.uid
    WHERE (p."createdAt" > $1 OR p."updatedAt" > $1) AND p."isDeleted" = false
  `, [lastCheckpoint]);
  console.log('Got data from Project table:', r.rows.length);
  if (!r.rows.length) return 0;

  const body = r.rows.flatMap(row => [
    { index: { _index: 'project', _id: row.uid } },
    {
      uid: row.uid,
      name: row.name,
      image: row.url,
      tagline: row.tagline,
      description: purifyHtml(row.description),
      readMe: row.readMe,
      tags: row.tags || [],
      name_suggest: { input: generateSuggestInput(row.name) },
      tagline_suggest: { input: generateSuggestInput(row.tagline) },
      tags_suggest: { input: row.tags || [] }
    }
  ]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => x.index && x.index.error);
    console.error('Project bulk errors:', JSON.stringify(failed.slice(0, 10), null, 2));
    return 0;
  }
  return r.rows.length;
}

async function indexEvents(lastCheckpoint) {
  const r = await pgClient.query(`
    SELECT e.uid, e.name, e.description, e."additionalInfo", e."shortDescription", el.location, i.url
    FROM "PLEvent" e
           LEFT JOIN "PLEventLocation" el ON e."locationUid" = el.uid
           LEFT JOIN "Image" i ON e."logoUid" = i.uid
    WHERE e."createdAt" > $1 OR e."updatedAt" > $1
  `, [lastCheckpoint]);
  console.log('Got data from PLEvent table:', r.rows.length);
  if (!r.rows.length) return 0;

  const body = r.rows.flatMap(row => [
    { index: { _index: 'event', _id: row.uid } },
    {
      uid: row.uid,
      name: row.name,
      image: row.url,
      description: purifyHtml(row.description),
      additionalInfo: row.additionalInfo ? JSON.stringify(row.additionalInfo) : null,
      shortDescription: row.shortDescription,
      location: row.location,
      name_suggest: { input: generateSuggestInput(row.name) },
      shortDescription_suggest: { input: generateSuggestInput(row.shortDescription) },
      location_suggest: { input: generateSuggestInput(row.location) }
    }
  ]);
  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => x.index && x.index.error);
    console.error('Event bulk errors:', JSON.stringify(failed.slice(0, 10), null, 2));
    return 0;
  }
  return r.rows.length;
}

function toDateFromNodebb(ts) {
  if (ts == null) return null;
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  const ms = n >= 1000000000000 ? n : (n >= 1000000000 ? n * 1000 : null);
  return ms ? new Date(ms) : null;
}

async function indexForumTopics(forumCheckpointISO) {
  const db = await initMongo();
  if (!db) return { count: 0, maxTs: null };
  const coll = db.collection('objects');
  const lastCP = forumCheckpointISO ? new Date(forumCheckpointISO) : new Date(0);

  const pipeline = [
    { $match: { _key: { $regex: /^topic:\d+$/ } } },
    { $addFields: {
        tid: { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
        _tsMs: {
          $cond: [
            { $gte: ['$timestamp', 1000000000000] }, '$timestamp',
            { $cond: [{ $gte: ['$timestamp', 1000000000] }, { $multiply: ['$timestamp', 1000] }, null] }
          ]
        }
      }
    },
    { $addFields: { tsDate: { $cond: [{ $ifNull: ['$_tsMs', false] }, { $toDate: '$_tsMs' }, null] } } },
    { $match: { $or: [{ deleted: { $exists: false } }, { deleted: false }, { deleted: 0 }] } },
    { $match: { tsDate: { $gt: lastCP } } },
    { $project: { _id: 0, tid: 1, title: 1, slug: 1, cid: 1, postcount: 1, tsDate: 1, lastposttime: 1 } },
    { $sort: { tsDate: 1 } }
  ];

  const cursor = coll.aggregate(pipeline, { allowDiskUse: true });
  let maxTs = lastCP;
  const body = [];
  let count = 0;

  for await (const t of cursor) {
    const id = String(t.tid);
    const url = t.slug ? `${FORUM_BASE_URL}/topic/${t.slug}` : null;
    body.push({ index: { _index: 'forum_topic', _id: id } });
    body.push({
      uid: id,
      tid: t.tid ?? null,
      title: t.title ?? '',
      slug: t.slug ?? null,
      cid: t.cid ?? null,
      postcount: t.postcount ?? 0,
      timestamp: t.tsDate || null,
      lastposttime: toDateFromNodebb(t.lastposttime),
      name: t.title ?? '',
      image: null,
      name_suggest: { input: generateSuggestInput(t.title ?? '') },
      url
    });
    if (t.tsDate && new Date(t.tsDate) > maxTs) maxTs = new Date(t.tsDate);
    count++;
  }

  if (!body.length) return { count: 0, maxTs: lastCP };

  const resp = await osClient.bulk({ body });
  if (resp.body.errors) {
    const failed = resp.body.items.filter(x => (x.index && x.index.error) || (x.create && x.create.error) || (x.update && x.update.error));
    console.error('[forum_topic] bulk errors count:', failed.length);
    console.error('[forum_topic] sample errors:', JSON.stringify(failed.slice(0, 10), null, 2));
  }
  console.log('Indexed forum topics:', count);
  return { count, maxTs };
}

async function indexForumPosts(forumCheckpointISO) {
  const db = await initMongo();
  if (!db) return { count: 0, maxTs: null };

  const coll = db.collection('objects');
  const lastCP = forumCheckpointISO ? new Date(forumCheckpointISO) : new Date(0);

  const pipeline = [
    // Keep only posts
    { $match: { _key: { $regex: /^post:\d+$/ } } },

    // Extract pid from key and normalize tid into integer
    { $addFields: {
        pid: { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
        tidInt: {
          $cond: [
            { $isNumber: '$tid' }, '$tid',
            { $toInt: '$tid' }
          ]
        },
        _tsMs: {
          $cond: [
            { $gte: ['$timestamp', 1000000000000] }, '$timestamp',
            { $cond: [{ $gte: ['$timestamp', 1000000000] }, { $multiply: ['$timestamp', 1000] }, null] }
          ]
        }
      }
    },

    // Convert timestamp to date
    { $addFields: { tsDate: { $cond: [{ $ifNull: ['$_tsMs', false] }, { $toDate: '$_tsMs' }, null] } } },

    // Exclude deleted posts
    { $match: { $or: [{ deleted: { $exists: false } }, { deleted: false }, { deleted: 0 }] } },

    // Apply checkpoint
    { $match: { tsDate: { $gt: lastCP } } },

    // Lookup topic metadata by tidInt
    { $lookup: {
        from: 'objects',
        let: { tidNum: '$tidInt' },
        pipeline: [
          { $match: { $expr: { $and: [
                  { $regexMatch: { input: '$_key', regex: /^topic:\d+$/ } },
                  {
                    $eq: [
                      { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
                      '$$tidNum'
                    ]
                  }
                ] } } },
          { $project: { _id: 0, title: 1, slug: 1, cid: 1 } }
        ],
        as: 'topic'
      }
    },
    { $unwind: '$topic' },

    // Determine first post (OP) in each topic
    { $setWindowFields: {
        partitionBy: '$tidInt',
        sortBy: { pid: 1 },
        output: { firstPid: { $first: '$pid' } }
      }
    },

    // Flag comments vs OP
    { $addFields: { isComment: { $ne: ['$pid', '$firstPid'] } } },

    // Deterministic sort order
    { $sort: { tsDate: 1 } }
  ];

  const cursor = coll.aggregate(pipeline, { allowDiskUse: true });
  let maxTs = lastCP;
  const body = [];
  let count = 0;

  for await (const p of cursor) {
    const id = String(p.pid);
    const title = p.topic?.title || '';
    const slug = p.topic?.slug || null;
    const contentPlain = stripHtml(p.content);
    const url = slug
      ? (p.pid === p.firstPid ? `${FORUM_BASE_URL}/topic/${slug}` : `${FORUM_BASE_URL}/topic/${slug}#pid${p.pid}`)
      : null;

    body.push({ index: { _index: 'forum_post', _id: id } });
    body.push({
      uid: id,
      pid: p.pid ?? null,
      tid: p.tidInt ?? null,   // normalized tid
      uidAuthor: p.uid ?? null,
      content: contentPlain,
      timestamp: p.tsDate || null,
      edited: toDateFromNodebb(p.edited),
      topicTitle: title,
      topicSlug: slug,
      topicCid: p.topic?.cid || null,
      name: title ? `[${title}] ${contentPlain.slice(0, 120)}` : contentPlain.slice(0, 120),
      image: null,
      name_suggest: { input: generateSuggestInput(title) },
      url,
      isComment: p.pid !== p.firstPid
    });

    if (p.tsDate && new Date(p.tsDate) > maxTs) maxTs = new Date(p.tsDate);
    count++;
  }

  if (!body.length) return { count: 0, maxTs: lastCP };

  const resp = await osClient.bulk({ body });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter(x => (x.index && x.index.error) || (x.create && x.create.error) || (x.update && x.update.error));
    console.error('[forum_post] bulk errors count:', failed.length);
    console.error('[forum_post] sample errors:', JSON.stringify(failed.slice(0, 10), null, 2));
  }

  console.log('Indexed forum posts:', count);
  return { count, maxTs };
}

export const handler = async () => {
  const lastCheckpoint = await getLastCheckpoint();
  console.log('PG checkpoint:', lastCheckpoint);

  const forumCheckpoint = await getForumCheckpoint();
  if (forumCheckpoint) console.log('Forum checkpoint:', forumCheckpoint);

  await initPgPool();

  try {
    await deleteRejectedMembersFromOpenSearch();
    await deleteDeletedProjectsFromOpenSearch();

    const m = await indexMembers(lastCheckpoint);
    const t = await indexTeams(lastCheckpoint);
    const p = await indexProjects(lastCheckpoint);
    const e = await indexEvents(lastCheckpoint);
    const changed = m + t + p + e;

    if (changed > 0) {
      console.log(`Found ${changed} PG changes`);
      const maxTs = await getMaxTimestamp();
      console.log('Max timestamp in all the tables:', maxTs);
      if (newerCheckpointFound(lastCheckpoint, maxTs)) {
        await updateCheckpoint(maxTs);
        console.log('PG checkpoint updated');
      } else {
        console.log('There is no newer PG checkpoint to update');
      }
    } else {
      console.log('PG: no new data to update');
    }

    if (forumCheckpoint) {
      const { count: tc, maxTs: tmax } = await indexForumTopics(forumCheckpoint);
      const { count: pc, maxTs: pmax } = await indexForumPosts(forumCheckpoint);
      const fChanged = (tc || 0) + (pc || 0);
      if (fChanged > 0) {
        const fMax = (tmax && pmax) ? (tmax > pmax ? tmax : pmax) : (tmax || pmax);
        if (fMax && newerCheckpointFound(forumCheckpoint, fMax)) {
          await updateForumCheckpoint(fMax);
        } else {
          console.log('Forum: no newer checkpoint to update');
        }
      } else {
        console.log('Forum: no new data to update');
      }
    } else {
      console.log('Forum: skipped (no checkpoint or no permissions/uri)');
    }

    console.log('All indexing finished');
  } finally {
    try { if (pgClient) pgClient.release(); } catch {}
    pgClient = null;
    try { if (mongoClient) await mongoClient.close(); } catch {}
    mongoClient = null;
    mongoDb = null;
  }
};

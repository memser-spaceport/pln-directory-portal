import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { MongoClient } from 'mongodb';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import sanitizeHtml from 'sanitize-html';

const ssm = new SSMClient({});
const CHECKPOINT_PATH = process.env.CHECKPOINT_PATH;

// --- Forum checkpoints (LIGHT: ts + pid) ---
const CHECKPOINT_FORUM_TS_PATH = process.env.CHECKPOINT_FORUM_PATH;       // ISO path
const CHECKPOINT_FORUM_PID_PATH = process.env.CHECKPOINT_FORUM_PID_PATH;  // PID path

const PG_PORT = process.env.PG_PORT;
const OS_REGION = process.env.OS_REGION;
const OS_SERVICE = process.env.OS_SERVICE;
const OS_HOST = process.env.OS_HOST;
const FORUM_BASE_URL = process.env.FORUM_BASE_URL || 'https://forum.example.com';
const MONGO_URI = process.env.MONGO_URI;
const MONGO_URI_PARAM = process.env.MONGO_URI_PARAM;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'nodebb_forum';

let pgPool;
let pgClient;
let mongoClient;
let mongoDb;

const osClient = new Client({
  ...AwsSigv4Signer({ region: OS_REGION, service: OS_SERVICE, getCredentials: defaultProvider() }),
  node: OS_HOST
});

// ----- SSM helpers -----
async function getParameter(name, withDecryption = true) {
  const cmd = new GetParameterCommand({ Name: name, WithDecryption: withDecryption });
  const res = await ssm.send(cmd);
  return res?.Parameter?.Value;
}

async function getLastCheckpoint() {
  try {
    return await getParameter(CHECKPOINT_PATH, false);
  } catch (err) {
    if (err && err.name === 'ParameterNotFound') return '1970-01-01T00:00:00Z';
    throw err;
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

// ----- Forum checkpoint (ts, pid) -----
async function getForumPostCheckpoint() {
  if (!CHECKPOINT_FORUM_TS_PATH) return null;
  let ts = new Date('1970-01-01T00:00:00Z');
  let pid = 0;
  let writableTs = true;
  let writablePid = !!CHECKPOINT_FORUM_PID_PATH;

  try {
    const tsStr = await getParameter(CHECKPOINT_FORUM_TS_PATH, false);
    if (tsStr) ts = new Date(tsStr);
  } catch (err) {
    if (!(err && err.name === 'ParameterNotFound')) {
      console.warn('Forum TS checkpoint read failed:', err?.message || err);
      return null;
    }
  }
  if (CHECKPOINT_FORUM_PID_PATH) {
    try {
      const pidStr = await getParameter(CHECKPOINT_FORUM_PID_PATH, false);
      if (pidStr != null) pid = parseInt(pidStr, 10) || 0;
    } catch (err) {
      if (!(err && err.name === 'ParameterNotFound')) {
        console.warn('Forum PID checkpoint read failed:', err?.message || err);
      }
    }
  }
  return { ts, pid, writableTs, writablePid };
}

async function setForumPostCheckpoint(ts, pid, cp) {
  const ops = [];
  if (cp?.writableTs && CHECKPOINT_FORUM_TS_PATH) {
    ops.push(ssm.send(new PutParameterCommand({
      Name: CHECKPOINT_FORUM_TS_PATH,
      Value: ts.toISOString(),
      Type: 'String',
      Overwrite: true
    })));
  }
  if (cp?.writablePid && CHECKPOINT_FORUM_PID_PATH) {
    ops.push(ssm.send(new PutParameterCommand({
      Name: CHECKPOINT_FORUM_PID_PATH,
      Value: String(pid),
      Type: 'String',
      Overwrite: true
    })));
  }
  if (ops.length) await Promise.all(ops);
}

function lexNewer(aTs, aPid, bTs, bPid) {
  if (aTs > bTs) return true;
  if (aTs < bTs) return false;
  return aPid > bPid;
}

// ----- PG init -----
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

// ----- Mongo init -----
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

// ----- PG helpers (unchanged) -----
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
  const without = sanitizeHtml(html || '', { allowedTags: [], allowedAttributes: [] });
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
function toDateFromNodebb(ts) {
  if (ts == null) return null;
  const n = Number(ts);
  if (!Number.isFinite(n)) return null;
  const ms = n >= 1000000000000 ? n : (n >= 1000000000 ? n * 1000 : null);
  return ms ? new Date(ms) : null;
}

// ----- OpenSearch deletions (PG) -----
async function deleteRejectedMembersFromOpenSearch() {
  const r = await pgClient.query(`SELECT uid FROM "Member" WHERE "accessLevel" IN ('Rejected', 'L0', 'L1')`);
  const uids = r.rows.map(x => x.uid);
  if (!uids.length) return;
  const body = uids.flatMap(uid => [{ delete: { _index: 'member', _id: uid } }]);
  const resp = await osClient.bulk({ body });
  if (resp.body?.errors) {
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
  if (resp.body?.errors) {
    const failed = resp.body.items.filter(x => (x.delete && x.delete.error) || (x.index && x.index.error));
    console.error('Project deletes failed:', JSON.stringify(failed.slice(0, 10), null, 2));
  } else {
    console.log(`Deleted ${uids.length} deleted projects`);
  }
}

// ----- OpenSearch indexing (PG) -----
async function indexMembers(lastCheckpoint) {
  const r = await pgClient.query(`
    SELECT m.uid, m.name, m.bio, i.url, m."scheduleMeetingCount", m."officeHours"
    FROM "Member" m
           LEFT JOIN "Image" i ON m."imageUid" = i.uid
    WHERE (m."createdAt" > $1 OR m."updatedAt" > $1)
      AND m."accessLevel" NOT IN ('L0', 'L1', 'Rejected')
  `, [lastCheckpoint]);

  console.log('Got data from Member table:', r.rows.length);
  if (!r.rows.length) return 0;

  const body = r.rows.flatMap(row => {
    const officeHoursUrl = row.officeHours && String(row.officeHours).trim()
      ? String(row.officeHours).trim()
      : null;

    return [
      { index: { _index: 'member', _id: row.uid } },
      {
        uid: row.uid,
        name: row.name,
        image: row.url,
        bio: purifyHtml(row.bio),
        scheduleMeetingCount: row.scheduleMeetingCount,
        officeHoursUrl,
        availableToConnect: Boolean(officeHoursUrl),
        name_suggest: { input: generateSuggestInput(row.name) }
      }
    ];
  });

  const resp = await osClient.bulk({ body });
  if (resp.body?.errors) {
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
  if (resp.body?.errors) {
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
  if (resp.body?.errors) {
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
  if (resp.body?.errors) {
    const failed = resp.body.items.filter(x => x.index && x.index.error);
    console.error('Event bulk errors:', JSON.stringify(failed.slice(0, 10), null, 2));
    return 0;
  }
  return r.rows.length;
}

// ----- Forum: build forum_thread (one doc per tid) with LIGHT checkpoint -----
async function indexForumThreadsWithCheckpoint() {
  const db = await initMongo();
  if (!db) return null;
  const coll = db.collection('objects');

  const cp = await getForumPostCheckpoint();
  if (!cp) {
    console.log('Forum: skipped (no forum checkpoint paths configured)');
    return null;
  }
  console.log('Forum checkpoint (ts, pid):', cp.ts.toISOString(), cp.pid);

  // find changed threads since (ts, pid)
  const pipelineNew = [
    { $match: { _key: { $regex: /^post:\d+$/ } } },
    { $addFields: {
        pid: { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
        tidInt: { $cond: [{ $isNumber: '$tid' }, '$tid', { $toInt: '$tid' }] },
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
    { $match: {
        $or: [
          { tsDate: { $gt: cp.ts } },
          { $and: [ { tsDate: cp.ts }, { pid: { $gt: cp.pid } } ] }
        ]
      }
    },
    { $project: { _id: 0, tidInt: 1, pid: 1, tsDate: 1 } },
    { $sort: { tsDate: 1, pid: 1 } }
  ];

  const cursorNew = coll.aggregate(pipelineNew, { allowDiskUse: true });
  const changedTids = new Set();
  let maxTs = cp.ts;
  let maxPid = cp.pid;

  for await (const p of cursorNew) {
    changedTids.add(p.tidInt);
    if (lexNewer(p.tsDate, p.pid, maxTs, maxPid)) {
      maxTs = p.tsDate; maxPid = p.pid;
    }
  }

  if (!changedTids.size) {
    console.log('Forum: no new posts since checkpoint');
    return { changed: 0, maxTs, maxPid };
  }

  // rebuild each changed thread fully
  const body = [];
  let changed = 0;

  for (const tid of changedTids) {
    const topic = await coll.findOne(
      { _key: `topic:${tid}` },
      { projection: { _id: 0, title: 1, slug: 1 } }
    );
    const topicTitle = topic?.title || '';
    const topicSlug = topic?.slug || null;
    const topicUrl = topicSlug ? `${FORUM_BASE_URL}/topic/${topicSlug}` : null;

    const postPipe = [
      { $match: { _key: { $regex: /^post:\d+$/ } } },
      { $addFields: {
          pid: { $toInt: { $arrayElemAt: [{ $split: ['$_key', ':'] }, 1] } },
          tidInt: { $cond: [{ $isNumber: '$tid' }, '$tid', { $toInt: '$tid' }] },
          _tsMs: {
            $cond: [
              { $gte: ['$timestamp', 1000000000000] }, '$timestamp',
              { $cond: [{ $gte: ['$timestamp', 1000000000] }, { $multiply: ['$timestamp', 1000] }, null] }
            ]
          }
        }
      },
      { $addFields: { tsDate: { $cond: [{ $ifNull: ['$_tsMs', false] }, { $toDate: '$_tsMs' }, null] } } },
      { $match: { $and: [
            { $or: [{ deleted: { $exists: false } }, { deleted: false }, { deleted: 0 }] },
            { tidInt: tid }
          ] } },
      { $addFields: { uidKey: { $concat: ['user:', { $toString: '$uid' }] } } },
      { $lookup: { from: 'objects', localField: 'uidKey', foreignField: '_key', as: 'user' } },
      { $addFields: { user: { $first: '$user' } } },
      { $sort: { pid: 1 } },
      { $project: {
          _id: 0, pid: 1, uid: 1, content: 1, tsDate: 1,
          'user.username': 1, 'user.fullname': 1, 'user.userslug': 1,
          'user.picture': 1, 'user.uploadedpicture': 1, 'user.gravatarpicture': 1
        } }
    ];

    const postsCur = coll.aggregate(postPipe, { allowDiskUse: true });
    const posts = [];
    for await (const x of postsCur) posts.push(x);
    if (!posts.length) continue;

    const first = posts[0];
    const firstPid = first.pid;

    const toAuthor = (u) => ({
      name: u?.fullname || u?.username || null,
      username: u?.username || null,
      slug: u?.userslug || null,
      image: u?.picture ?? u?.uploadedpicture ?? u?.gravatarpicture ?? null
    });

    const makeUrl = (pid) =>
      topicUrl ? (pid === firstPid ? topicUrl : `${topicUrl}#pid${pid}`) : null;

    const rootPost = {
      pid: first.pid,
      uidAuthor: first.uid ?? null,
      author: toAuthor(first.user),
      timestamp: posts[0].tsDate || null,
      url: makeUrl(first.pid),
      content: stripHtml(first.content)
    };

    const replies = posts.slice(1).map(p => ({
      pid: p.pid,
      uidAuthor: p.uid ?? null,
      author: toAuthor(p.user),
      timestamp: p.tsDate || null,
      url: makeUrl(p.pid),
      content: stripHtml(p.content)
    }));

    const doc = {
      uid: String(tid),
      tid,
      topicTitle,
      topicSlug,
      topicUrl,
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
    changed++;
  }

  if (!body.length) {
    console.log('Forum: threads changed, but nothing to upsert');
    return { changed: 0, maxTs, maxPid };
  }

  const resp = await osClient.bulk({ body });
  if (resp.body?.errors) {
    const failed = resp.body.items.filter(x => (x.index && x.index.error));
    console.error('[forum_thread] bulk errors count:', failed.length);
    console.error('[forum_thread] sample errors:', JSON.stringify(failed.slice(0, 10), null, 2));
    return { changed: 0, maxTs: cp.ts, maxPid: cp.pid };
  }

  console.log(`Indexed/updated ${changed} thread docs into forum_thread`);
  return { changed, maxTs, maxPid };
}

// ----- Lambda handler -----
export const handler = async () => {
  const lastCheckpoint = await getLastCheckpoint();
  console.log('PG checkpoint:', lastCheckpoint);

  await initPgPool();

  try {
    // PG side
    await deleteRejectedMembersFromOpenSearch();
    await deleteDeletedProjectsFromOpenSearch();

    const m = await indexMembers(lastCheckpoint);
    const t = await indexTeams(lastCheckpoint);
    const p = await indexProjects(lastCheckpoint);
    const e = await indexEvents(lastCheckpoint);
    const changedPg = m + t + p + e;

    if (changedPg > 0) {
      console.log(`Found ${changedPg} PG changes`);
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

    // Forum side (only forum_thread)
    const forumRes = await indexForumThreadsWithCheckpoint();
    if (forumRes && forumRes.changed > 0) {
      const cp = await getForumPostCheckpoint(); // reread to know writability
      if (cp) {
        await setForumPostCheckpoint(forumRes.maxTs, forumRes.maxPid, cp);
        console.log('Forum checkpoint updated ->', forumRes.maxTs.toISOString(), forumRes.maxPid);
      }
    } else if (forumRes) {
      console.log('Forum: no new data to update');
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

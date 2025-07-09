import { GetParameterCommand, PutParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { Pool } from 'pg';
import { Client } from '@opensearch-project/opensearch';
import { AwsSigv4Signer } from '@opensearch-project/opensearch/aws';
import { defaultProvider } from '@aws-sdk/credential-provider-node';
import sanitizeHtml from 'sanitize-html';

const ssm = new SSMClient({});
const CHECKPOINT_PATH = process.env.CHECKPOINT_PATH;
const PG_PORT = process.env.PG_PORT;
const OS_REGION = process.env.OS_REGION;
const OS_SERVICE = process.env.OS_SERVICE;
const OS_HOST = process.env.OS_HOST;

let pgPool; // shared across Lambda invocations
let pgClient; // shared across Lambda invocations

const osClient = new Client({
  ...AwsSigv4Signer({
    region: OS_REGION,
    service: OS_SERVICE,
    getCredentials: defaultProvider()
  }),
  node: OS_HOST
});

async function initPgPool() {
  if (!pgPool) {
    const [host, user, database, password, port] = await Promise.all([
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
      ssl: {
        rejectUnauthorized: false
      },
      max: 2
    });
  }

  if (!pgClient) {
    pgClient = await pgPool.connect();
  }
}

async function getParameter(name, withDecryption = true) {
  const command = new GetParameterCommand({
    Name: name,
    WithDecryption: withDecryption
  });
  const response = await ssm.send(command);
  return response.Parameter.Value;
}

async function getLastCheckpoint() {
  try {
    return getParameter(CHECKPOINT_PATH, false);
  } catch (err) {
    if (err.name === 'ParameterNotFound') return '1970-01-01T00:00:00Z';
    throw err;
  }
}

async function updateCheckpoint(newTimestamp) {
  await ssm.send(
    new PutParameterCommand({
      Name: CHECKPOINT_PATH,
      Value: newTimestamp.toISOString(),
      Type: 'String',
      Overwrite: true
    })
  );
}

async function getMaxTimestampForTable(pgClient, table) {
  const query = `
    SELECT GREATEST(
      COALESCE(MAX("createdAt"), 'epoch'),
      COALESCE(MAX("updatedAt"), 'epoch')
    ) AS max_timestamp
    FROM ${table}
  `;
  const result = await pgClient.query(query);
  return result.rows[0].max_timestamp;
}

async function getMaxTimestamp() {
  const maxTimestamps = await Promise.all([
    getMaxTimestampForTable(pgClient, '"Member"'),
    getMaxTimestampForTable(pgClient, '"Team"'),
    getMaxTimestampForTable(pgClient, '"Project"'),
    getMaxTimestampForTable(pgClient, '"PLEvent"')
  ]);

  let maxTimestamp = null;

  for (const ts of maxTimestamps) {
    if (!ts) continue; // skip nulls

    if (!maxTimestamp || ts > maxTimestamp) {
      maxTimestamp = ts;
    }
  }

  return maxTimestamp;
}

function generateSuggestInput(text) {
  if (!text) return [];
  const tokens = text.split(/\s+/).filter(Boolean);
  return Array.from(new Set([text, ...tokens]));
}

function purifyHtml(html) {
  const withoutTags = sanitizeHtml(html, {
    allowedTags: [],
    allowedAttributes: []
  });
  return withoutTags.replaceAll('&nbsp;', ' ');
}

async function indexMembers(lastCheckpoint) {
  const res = await pgClient.query(`
    SELECT m.uid, m.name, m.bio, i.url
    FROM "Member" m
           LEFT JOIN "Image" i ON m."imageUid" = i.uid
    WHERE
      (m."createdAt" > $1 OR m."updatedAt" > $1)
      AND m."accessLevel" NOT IN ('L0', 'L1', 'Rejected')
  `, [lastCheckpoint]);

  console.log('Got data from Member table: ' + res.rows.length);

  if (res.rows.length === 0) {
    return 0;
  }

  const body = res.rows.flatMap(row => [
    { index: { _index: 'member', _id: row.uid } },
    {
      uid: row.uid,
      name: row.name,
      image: row.url,
      bio: purifyHtml(row.bio),
      name_suggest: { input: generateSuggestInput(row.name) }
    }
  ]);

  const response = await osClient.bulk({ body });
  if (response.body.errors) {
    console.error('Some documents failed to index to member');
    return 0;
  }

  return res.rows.length;
}

async function indexTeams(lastCheckpoint) {
  const res = await pgClient.query(`
        SELECT t.uid, t.name, t."shortDescription", t."longDescription", i.url FROM "Team" t
        LEFT JOIN "Image" i ON t."logoUid" = i.uid
        WHERE t."createdAt" > $1 OR t."updatedAt" > $1
    `, [lastCheckpoint]);

  console.log('Got data from Team table: ' + res.rows.length);

  if (res.rows.length === 0) {
    return 0;
  }

  const body = res.rows.flatMap(row => [
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

  const response = await osClient.bulk({ body });
  if (response.body.errors) {
    console.error('Some documents failed to index to team');
    return 0;
  }

  return res.rows.length;
}

async function indexProjects(lastCheckpoint) {
  const res = await pgClient.query(`
        SELECT p.uid, p.name, p.tagline, p.description, p."readMe", p.tags, i.url FROM "Project" p
        LEFT JOIN "Image" i ON p."logoUid" = i.uid
        WHERE p."createdAt" > $1 OR p."updatedAt" > $1
    `, [lastCheckpoint]);

  console.log('Got data from Project table: ' + res.rows.length);

  if (res.rows.length === 0) {
    return 0;
  }

  const body = res.rows.flatMap(row => [
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

  const response = await osClient.bulk({ body });
  if (response.body.errors) {
    console.error('Some documents failed to index to project');
    return 0;
  }

  return res.rows.length;
}

async function indexEvents(lastCheckpoint) {
  const res = await pgClient.query(`
        SELECT e.uid, e.name, e.description, e."additionalInfo", e."shortDescription", el.location, i.url
        FROM "PLEvent" e
        LEFT JOIN "PLEventLocation" el ON e."locationUid" = el.uid
        LEFT JOIN "Image" i ON e."logoUid" = i.uid
        WHERE e."createdAt" > $1 OR e."updatedAt" > $1
    `, [lastCheckpoint]);

  console.log('Got data from PLEvent table: ' + res.rows.length);

  if (res.rows.length === 0) {
    return 0;
  }

  const body = res.rows.flatMap(row => [
    { index: { _index: 'event', _id: row.uid } },
    {
      uid: row.uid,
      name: row.name,
      image: row.url,
      description: purifyHtml(row.description),
      additionalInfo: row.additionalInfo
        ? JSON.stringify(row.additionalInfo)
        : null,
      shortDescription: row.shortDescription,
      location: row.location,
      name_suggest: { input: generateSuggestInput(row.name) },
      shortDescription_suggest: { input: generateSuggestInput(row.shortDescription) },
      location_suggest: { input: generateSuggestInput(row.location) }
    }
  ]);

  const response = await osClient.bulk({ body });
  if (response.body.errors) {
    console.error('Some documents failed to index to event');
    return 0;
  }

  return res.rows.length;
}

function newerCheckpointFound(lastCheckpoint, maxTimestamp) {
  const dMaxTimestamp = new Date(maxTimestamp);
  const dLastCheckpoint = new Date(lastCheckpoint);
  return dMaxTimestamp && dMaxTimestamp > dLastCheckpoint;
}

export const handler = async () => {
  const lastCheckpoint = await getLastCheckpoint();
  console.log('Last checkpoint:', lastCheckpoint);

  await initPgPool();

  try {
    const memberRowsChanged = await indexMembers(lastCheckpoint);
    const teamRowsChanged = await indexTeams(lastCheckpoint);
    const projectRowsChanged = await indexProjects(lastCheckpoint);
    const eventRowsChanged = await indexEvents(lastCheckpoint);

    const rowChanged = memberRowsChanged + teamRowsChanged + projectRowsChanged + eventRowsChanged;

    console.log('All tables have been successfully indexed');

    if (rowChanged > 0) {
      console.log(`Found ${rowChanged} changes`);

      const maxTimestamp = await getMaxTimestamp();
      console.log('Max timestamp in all the tables:', maxTimestamp);

      if (newerCheckpointFound(lastCheckpoint, maxTimestamp)) {
        console.log(`New checkpoint found. Going to update to ${maxTimestamp}`);
        await updateCheckpoint(maxTimestamp);
      } else {
        console.log('There is no newer checkpoint to update');
      }
    } else {
      console.log('No new data to update');
    }
  } finally {
    if (!pgClient) {
      pgClient.release();
    }
  }
};

/**
 * Seed AI App tile signals from historical Directory iframe loads
 * (`ai_apps_iframe_loaded` in PostHog).
 *
 *   npm run api:backfill-ai-app-views           # dry-run
 *   npm run api:backfill-ai-app-views -- --apply
 *
 * Needs POSTHOG_HOST, POSTHOG_PROJECT_ID, and a personal API key
 * (POSTHOG_PERSONAL_API_KEY, or POSTHOG_API_KEY if that key can query).
 * Project API keys used only for capture cannot run HogQL.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const WAU_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

type HogQLResponse = {
  results?: unknown[][];
  columns?: string[];
  error?: string;
};

async function hogql(query: string): Promise<unknown[][]> {
  const host = (process.env.POSTHOG_HOST || 'https://us.posthog.com').replace(/\/$/, '');
  const projectId = process.env.POSTHOG_PROJECT_ID;
  const apiKey = process.env.POSTHOG_PERSONAL_API_KEY || process.env.POSTHOG_API_KEY;
  if (!projectId || !apiKey) {
    throw new Error('Set POSTHOG_PROJECT_ID and POSTHOG_PERSONAL_API_KEY (or a query-capable POSTHOG_API_KEY)');
  }

  const res = await fetch(`${host}/api/projects/${projectId}/query/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: { kind: 'HogQLQuery', query } }),
  });
  const body = (await res.json()) as HogQLResponse;
  if (!res.ok) {
    throw new Error(`PostHog query failed (${res.status}): ${body.error || JSON.stringify(body)}`);
  }
  return body.results ?? [];
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

  const viewRows = await hogql(`
    SELECT
      properties.appUid AS app_uid,
      count() AS views
    FROM events
    WHERE timestamp >= toDateTime('2020-01-01 00:00:00')
      AND event = 'ai_apps_iframe_loaded'
      AND properties.appUid IS NOT NULL
      AND properties.appUid != ''
    GROUP BY app_uid
  `);

  const lastSeenRows = await hogql(`
    SELECT
      properties.appUid AS app_uid,
      if(properties.$user_id IS NOT NULL AND properties.$user_id != '', properties.$user_id, distinct_id) AS member_uid,
      max(timestamp) AS last_seen
    FROM events
    WHERE timestamp >= now() - INTERVAL 7 DAY
      AND event = 'ai_apps_iframe_loaded'
      AND properties.appUid IS NOT NULL
      AND properties.appUid != ''
      AND distinct_id NOT LIKE 'anon:%'
    GROUP BY app_uid, member_uid
  `);

  console.log(`viewCount rows from PostHog: ${viewRows.length}`);
  for (const [appUid, views] of viewRows) {
    console.log(`  ${appUid} views=${views}`);
  }
  console.log(`active-member rows (last 7d): ${lastSeenRows.length}`);

  if (!apply) {
    console.log('Dry run. Re-run with --apply to write.');
    return;
  }

  const liveApps = await prisma.aiApp.findMany({
    where: { status: { not: 'DELETED' } },
    select: { uid: true },
  });
  const liveUids = new Set(liveApps.map((app) => app.uid));

  for (const [appUid, views] of viewRows) {
    if (typeof appUid !== 'string' || typeof views !== 'number') continue;
    if (!liveUids.has(appUid)) continue;
    await prisma.$executeRaw`
      UPDATE "AiApp" SET "viewCount" = ${Math.trunc(views)}
      WHERE uid = ${appUid} AND status <> 'DELETED'
    `;
  }

  const since = new Date(Date.now() - WAU_WINDOW_MS);
  for (const [appUid, memberUid, lastSeen] of lastSeenRows) {
    if (typeof appUid !== 'string' || typeof memberUid !== 'string') continue;
    if (!liveUids.has(appUid) || memberUid.startsWith('anon:')) continue;
    const lastSeenAt = lastSeen instanceof Date ? lastSeen : new Date(String(lastSeen));
    if (Number.isNaN(lastSeenAt.getTime()) || lastSeenAt < since) continue;
    await prisma.aiAppActiveMember.upsert({
      where: { appUid_memberUid: { appUid, memberUid } },
      create: { appUid, memberUid, lastSeenAt },
      update: { lastSeenAt },
    });
  }

  console.log('Applied.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

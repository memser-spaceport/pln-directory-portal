/**
 * One-time tag backfill for the AI Apps that existed before tags shipped.
 * Matches apps by display name (case-insensitive); apps not in the map, or
 * already tagged, are left alone.
 *
 *   npm run api:backfill-ai-app-tags           # dry-run
 *   npm run api:backfill-ai-app-tags -- --apply
 */
import { PrismaClient } from '@prisma/client';
import { AI_APPS_TAG_SLUGS } from '../ai-apps/ai-apps-tags';

const prisma = new PrismaClient();

const TAGS_BY_APP_NAME: Record<string, string[]> = {
  'Ask Triage': ['network', 'knowledge', 'decision-support'],
  Caliber: ['venture', 'decision-support'],
  'Comms Console': ['content', 'dashboards'],
  'Content Studio': ['content'],
  Henry: ['ai-agents'],
  'Henry Starter Playbook': ['knowledge', 'ai-agents', 'people-ops'],
  'Interventions Console': ['decision-support', 'planning'],
  'LabOS Bridge': ['ai-agents', 'developer-tools', 'knowledge'],
  'Network Pulse': ['network', 'knowledge', 'dashboards'],
  'OSO Connectivity Graph': ['network', 'dashboards'],
  'PL Agents': ['ai-agents'],
  'PLaybook - Knowledge Sharing': ['knowledge'],
  'PL Deal Debrief': ['venture', 'knowledge'],
  'PL Decision': ['decision-support', 'ai-agents'],
  'PL Factorio (Demo)': ['planning', 'dashboards', 'developer-tools'],
  'PL Infra AI Toolkit': ['knowledge', 'developer-tools'],
  'PL Infra Events': ['events'],
  'PL Infra JD Generator': ['people-ops', 'content'],
  'PL Infra OKRs': ['planning', 'dashboards'],
  'PL Infra OS / Factorio': ['planning', 'dashboards'],
  'PLN Flywheels': ['planning', 'dashboards'],
  'PLN Member Space': ['network', 'dashboards'],
  'PLN Members Scorecard': ['network', 'decision-support', 'dashboards'],
  'Portfolio Focus 13': ['venture', 'dashboards'],
  'Portfolio Focus 13 (Live)': ['venture', 'dashboards'],
  'Portfolio Pulse': ['venture', 'dashboards'],
  Roadmapper: ['planning', 'dashboards'],
  "Santa's Workshop -- Session Hub + Resource Library": ['events', 'knowledge', 'network'],
  Scout: ['venture', 'network', 'decision-support'],
  'Strategy Graph': ['planning', 'network', 'dashboards'],
};

const normalize = (name: string) => name.trim().toLowerCase();

async function main() {
  const apply = process.argv.includes('--apply');

  for (const tags of Object.values(TAGS_BY_APP_NAME)) {
    const unknown = tags.filter((tag) => !AI_APPS_TAG_SLUGS.includes(tag));
    if (unknown.length) {
      throw new Error(`Unknown tag slug(s) in backfill map: ${unknown.join(', ')}`);
    }
  }

  const tagsByNormalizedName = new Map(Object.entries(TAGS_BY_APP_NAME).map(([name, tags]) => [normalize(name), tags]));
  const apps = await prisma.aiApp.findMany({
    where: { status: { not: 'DELETED' } },
    select: { uid: true, name: true, tags: true },
  });

  let updated = 0;
  const unmatched: string[] = [];
  for (const app of apps) {
    const tags = tagsByNormalizedName.get(normalize(app.name));
    if (!tags) {
      unmatched.push(app.name);
      continue;
    }
    if (app.tags.length) {
      console.log(`skip  ${app.name} (already tagged: ${app.tags.join(', ')})`);
      continue;
    }
    console.log(`${apply ? 'set  ' : 'would'} ${app.name} -> ${tags.join(', ')}`);
    if (apply) {
      await prisma.aiApp.update({ where: { uid: app.uid }, data: { tags } });
    }
    updated += 1;
  }

  console.log(`\n${apply ? 'Updated' : 'Would update'} ${updated} of ${apps.length} apps.`);
  if (unmatched.length) {
    console.log(`No mapping for ${unmatched.length} app(s): ${unmatched.join(' | ')}`);
  }
  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to write.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

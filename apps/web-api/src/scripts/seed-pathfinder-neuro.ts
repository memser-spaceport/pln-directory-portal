/**
 * LOCAL-ONLY ingest of the REAL Neuro Fund I LP run into the Investor DB, so the
 * warm-intros workspace shows the real engine output (87/91 reachable, caliber A
 * included) instead of the 14-row demo seed.
 *
 * What it does (idempotent):
 *   1. Purges the demo cohort (source=DEMO_PATHFINDER) + demo/real pathfinder
 *      paths + demo crosswalk, and any prior real run (source=PATHFINDER_NEURO).
 *   2. Creates one InvestorOutreachRecord per graphed target in the runner dump
 *      (investorId = the graph lp_* id — the FK the pathfinder ingest needs), with
 *      "Who is this investor" enrichment folded in from the prestige cache where
 *      the LP name matches.
 *   3. Repoints the neuro-lp list at targetSet=neuro-fund-i (the runner's set),
 *      keeps it graphed, and replaces its membership with the real records.
 *
 * It does NOT create paths — run the runner with --post AFTER this to attach the
 * 372 PathfinderPath rows and denormalize bestProximityCode/hasPath:
 *   cd pln-data-enrichment/apps/data-enrichment && npx ts-node scripts/run-pathfinder.ts --post
 *
 * Scope note: the graph knows 91 firm-grain LP targets; the full 651-person
 * Affinity roster is a different grain (person vs firm) and joining it for
 * cold-membership needs a crosswalk — deferred. This seeds the 91 graphed targets.
 *
 * Reads the runner dump + prestige cache from the local scratch dirs (PII, never
 * committed). NOT for production. Run via `npm run api:seed-pathfinder-neuro`.
 */
import { readFileSync } from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'neuro-fund-i';
const NEW_SOURCE = 'PATHFINDER_NEURO';
const DEMO_SOURCE = 'DEMO_PATHFINDER';
const DEMO_TARGET_SET = 'demo-neuro-lp';
const DEMO_RUN_ID = 'demo-seed';
const LIST_SLUG = 'neuro-lp';

// Local scratch (outside any git tree) — runner dump + prestige cache. Override
// via env on a different machine; the defaults are this operator's local layout.
const SCRATCH_DIR =
  process.env.PATHFINDER_SCRATCH_DIR ||
  'C:/Users/anpan/code/claudecode/investor_paths_work/pplx_paths';
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_dump.json`;
const PRESTIGE_PATH =
  process.env.PATHFINDER_PRESTIGE_CACHE ||
  'C:/Users/anpan/code/pln-data-enrichment/apps/data-enrichment/_lp_prestige_cache.json';

interface DumpSummary {
  investor_id: string;
  best_proximity_code: string;
  has_path: boolean;
}
interface Dump {
  targetSet: string;
  summaries: DumpSummary[];
}
interface PrestigeEntry {
  name?: string;
  firm?: string | null;
  aum?: string | null;
  notableInvestments?: string[] | null;
  bio?: string | null;
  thesis?: string | null;
  fundFocus?: string | null;
  sources?: string[] | null;
  enrichedAt?: string;
}

const norm = (s: string): string =>
  (s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** lp_aff_elad_gil -> "Elad Gil"; lp_sequoia_capital -> "Sequoia Capital". */
function deslug(id: string): string {
  return id
    .replace(/^lp_aff_/, '')
    .replace(/^lp_/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

function loadPrestigeByName(): Map<string, PrestigeEntry> {
  const byName = new Map<string, PrestigeEntry>();
  try {
    const raw = JSON.parse(readFileSync(PRESTIGE_PATH, 'utf-8')) as Record<string, PrestigeEntry>;
    for (const [key, e] of Object.entries(raw)) {
      const name = e.name ?? key.split('||')[0];
      if (name && !byName.has(norm(name))) byName.set(norm(name), e);
    }
  } catch {
    console.warn('(no prestige cache — records will have no enrichment)');
  }
  return byName;
}

/** Map a prestige entry to the rawPayload.enrichment shape the BE mapper reads. */
function toEnrichment(e: PrestigeEntry): Record<string, unknown> | undefined {
  const enrichment: Record<string, unknown> = {};
  if (e.bio) enrichment.bio = e.bio;
  if (e.fundFocus) enrichment.fundFocus = e.fundFocus;
  if (e.aum) enrichment.aum = e.aum;
  if (e.notableInvestments?.length) enrichment.notableInvestments = e.notableInvestments;
  if (e.thesis) enrichment.thesis = e.thesis;
  if (e.sources?.length) enrichment.sources = e.sources;
  if (Object.keys(enrichment).length === 0) return undefined;
  enrichment.enrichedVia = 'perplexity+exa+firecrawl';
  enrichment.fetchedAt = e.enrichedAt ?? '2026-06-06';
  return enrichment;
}

async function cleanup() {
  // Paths first (FK), then demo + prior-real records (cascade memberships/overlaps).
  await prisma.pathfinderPath.deleteMany({
    where: { targetSet: { in: [DEMO_TARGET_SET, TARGET_SET] } },
  });
  await prisma.pathfinderEntityCrosswalk.deleteMany({ where: { ingestRunId: DEMO_RUN_ID } });
  await prisma.investorOutreachRecord.deleteMany({
    where: { source: { in: [DEMO_SOURCE, NEW_SOURCE] } },
  });
}

async function seedRecords(): Promise<{ created: number; enriched: number }> {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
  const prestige = loadPrestigeByName();
  let created = 0;
  let enriched = 0;

  for (const s of dump.summaries) {
    const slug = deslug(s.investor_id);
    const prest = prestige.get(norm(slug)) ?? null;
    const enrichment = prest ? toEnrichment(prest) : undefined;
    if (enrichment) enriched += 1;
    // Prefer the real name/firm from the prestige cache (avoids deslug artifacts
    // like "Elad GIL"); fall back to the de-slugged graph id for firm targets.
    const label = prest?.firm || prest?.name || slug;

    await prisma.investorOutreachRecord.create({
      data: {
        investorId: s.investor_id,
        dedupeKey: s.investor_id,
        canonicalId: s.investor_id,
        source: NEW_SOURCE,
        // Firm/person label as the display name so the "investor" column isn't
        // blank (these targets are firm-grain; the 5 person-LPs use their name).
        firstName: label,
        lastName: '',
        email: `${s.investor_id}@lp.local`,
        emailStatus: 'unverified',
        firm: label,
        investorType: 'fund',
        stageFocus: '',
        engagementTier: '',
        enrichmentStatus: enrichment ? 'enriched' : 'pending',
        bestProximityCode: s.has_path ? s.best_proximity_code : null,
        hasPath: s.has_path,
        rawPayload: enrichment ? ({ enrichment } as Prisma.InputJsonValue) : undefined,
      },
    });
    created += 1;
  }
  return { created, enriched };
}

async function repointListAndMembers(): Promise<{ listId: number; members: number }> {
  const list = await prisma.investorList.upsert({
    where: { slug: LIST_SLUG },
    update: { isGraphed: true, targetSet: TARGET_SET, externalRef: '352080' },
    create: {
      slug: LIST_SLUG,
      name: 'Neuro Fund I LP Pipeline',
      description: 'Curated LP pipeline for Neuro Fund I. Proximity is graphed for this list.',
      source: 'affinity',
      externalRef: '352080',
      isGraphed: true,
      targetSet: TARGET_SET,
    },
  });

  await prisma.investorListMembership.deleteMany({ where: { listId: list.id } });
  const records = await prisma.investorOutreachRecord.findMany({
    where: { source: NEW_SOURCE },
    select: { id: true },
  });
  await prisma.investorListMembership.createMany({
    data: records.map((r) => ({
      listId: list.id,
      investorOutreachRecordId: r.id,
      addedByEmail: 'seed@local',
      note: 'Seeded from the real Neuro Fund I LP run.',
    })),
    skipDuplicates: true,
  });
  return { listId: list.id, members: records.length };
}

async function main() {
  console.log('Purging demo cohort + prior real run…');
  await cleanup();
  console.log('Creating real LP records from the runner dump…');
  const { created, enriched } = await seedRecords();
  console.log('Repointing neuro-lp list + membership…');
  const { members } = await repointListAndMembers();
  console.log('— Real Neuro LP seed complete —');
  console.log(`records: ${created} (enriched: ${enriched}) | neuro-lp members: ${members}`);
  console.log('NEXT: run the runner with --post to attach paths + proximity codes.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

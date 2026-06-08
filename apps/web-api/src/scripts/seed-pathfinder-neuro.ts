/**
 * LOCAL-ONLY ingest of the REAL Neuro Fund I LP run into the Investor DB.
 *
 * PERSON-GRAIN (matches the Affinity LP list, the outreach tracker, and the
 * existing investor DB): rows are PEOPLE, identified by their Affinity entity id
 * (the authoritative LP id domain in the PathfinderEntityCrosswalk design). Each
 * person inherits the warm-path proximity of their FIRM — the graph resolves
 * proximity at the firm level (you reach a firm via people-connectors), and every
 * person at that firm shares it. When a person spans multiple firms, the BEST
 * (warmest) firm's proximity + paths are used.
 *
 * Idempotent:
 *   1. Purge the demo cohort + prior real run + their pathfinder paths.
 *   2. For each person in the Affinity LP list (352080): create an
 *      InvestorOutreachRecord keyed by the Affinity entity id (investorId =
 *      canonicalId = affinity id), with name/email/firm + prestige enrichment by
 *      name, and write person-keyed PathfinderPath rows copied from the person's
 *      best firm (so WarmPathDetail resolves by investor_id = person).
 *   3. Repoint + graph the neuro-lp list and set membership to the people.
 *
 * Crosswalk note: the record's investorId/canonicalId IS the Affinity id; the
 * affinity<->directory uid crosswalk table population is a separate follow-up
 * (the LabOS badge already works via the email->member join).
 *
 * Reads the runner dump + Affinity raw pull + prestige cache from local scratch
 * (PII, never committed). NOT for production. Run via `npm run api:seed-pathfinder-neuro`.
 */
import { readFileSync } from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'neuro-fund-i';
const NEW_SOURCE = 'PATHFINDER_NEURO';
const DEMO_SOURCE = 'DEMO_PATHFINDER';
const DEMO_TARGET_SET = 'demo-neuro-lp';
const DEMO_RUN_ID = 'demo-seed';
const RUN_ID = 'neuro-person-seed';
const LIST_SLUG = 'neuro-lp';

const SCRATCH_DIR =
  process.env.PATHFINDER_SCRATCH_DIR ||
  'C:/Users/anpan/code/claudecode/investor_paths_work/pplx_paths';
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_dump.json`;
const AFFINITY_PATH = `${SCRATCH_DIR}/_affinity_352080.json`;
const PRESTIGE_PATH =
  process.env.PATHFINDER_PRESTIGE_CACHE ||
  'C:/Users/anpan/code/pln-data-enrichment/apps/data-enrichment/_lp_prestige_cache.json';

// ── Types (loose — these are local scratch JSON shapes) ──────────────────────
interface DumpPath {
  targetInvestorId: string;
  connectorType: string;
  hops: number;
  caliber: string | null;
  caliberConfidence: number | null;
  proximityCode: string;
  score: number;
  rank: number;
  hopChain: unknown;
}
interface DumpSummary {
  investor_id: string;
  firm_label: string;
  best_proximity_code: string;
  has_path: boolean;
}
interface Dump {
  targetSet: string;
  paths: DumpPath[];
  summaries: DumpSummary[];
}
interface PrestigeEntry {
  name?: string;
  aum?: string | null;
  notableInvestments?: string[] | null;
  bio?: string | null;
  thesis?: string | null;
  fundFocus?: string | null;
  sources?: string[] | null;
  enrichedAt?: string;
}
interface AffinityField {
  id: string;
  value?: { data?: unknown };
}
interface AffinityEntity {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmailAddress?: string | null;
  emailAddresses?: string[] | null;
  fields?: AffinityField[];
}
interface AffinityEntry {
  entity: AffinityEntity;
}

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Prod dedupe_key form: normalized email (lowercased, trimmed, plus-tag stripped)
 * — matches the enrichment SCHEMA.md convention so these records line up with the
 * existing investor DB on ingest. Empty when there is no usable email.
 */
function normalizeEmailKey(email: string | null | undefined): string {
  const raw = (email ?? '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) return '';
  const local = raw.slice(0, at).split('+')[0];
  if (!local) return '';
  return `${local}@${raw.slice(at + 1)}`;
}

/** Firm names attached to an Affinity person's `companies` field. */
function entryFirmNames(entity: AffinityEntity): string[] {
  const comp = (entity.fields ?? []).find((f) => f.id === 'companies');
  const data = comp?.value?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => (d && typeof d === 'object' ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}

/** Warmer = smaller. Cold (no path) sinks last. */
function proximityRank(code: string | null, hasPath: boolean): number {
  if (!hasPath || !code) return 1e9;
  const m = /\+(\d)([AB])/.exec(code); // e.g. VC+2A -> hops=2 caliber=A
  if (!m) return 1e6;
  const caliber = m[2] === 'A' ? 0 : 1;
  const hops = parseInt(m[1], 10);
  return caliber * 100 + hops;
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

interface FirmProximity {
  firmId: string;
  label: string;
  code: string;
  hasPath: boolean;
}

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({
    where: { targetSet: { in: [DEMO_TARGET_SET, TARGET_SET] } },
  });
  await prisma.pathfinderEntityCrosswalk.deleteMany({
    where: { ingestRunId: { in: [DEMO_RUN_ID, RUN_ID] } },
  });
  await prisma.investorOutreachRecord.deleteMany({
    where: { source: { in: [DEMO_SOURCE, NEW_SOURCE] } },
  });
}

async function seed() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
  const prestige = loadPrestigeByName();

  // Index firm proximity by normalized firm label, and firm paths by firm id.
  const firmByLabel = new Map<string, FirmProximity>();
  for (const s of dump.summaries) {
    const key = norm(s.firm_label);
    if (key) {
      firmByLabel.set(key, {
        firmId: s.investor_id,
        label: s.firm_label,
        code: s.best_proximity_code,
        hasPath: s.has_path,
      });
    }
  }
  const pathsByFirm = new Map<string, DumpPath[]>();
  for (const p of dump.paths) {
    const arr = pathsByFirm.get(p.targetInvestorId) ?? [];
    arr.push(p);
    pathsByFirm.set(p.targetInvestorId, arr);
  }

  const entries = (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: AffinityEntry[] })
    .entries ?? [];

  let created = 0;
  let reachable = 0;
  let enriched = 0;
  let pathRows = 0;
  const seenAffinity = new Set<string>();

  for (const e of entries) {
    const ent = e.entity;
    const affinityId = String(ent.id);
    if (!affinityId || seenAffinity.has(affinityId)) continue;
    seenAffinity.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail =
      (ent.primaryEmailAddress ?? '').trim() ||
      (Array.isArray(ent.emailAddresses) ? ent.emailAddresses[0] : '') ||
      '';
    const email = realEmail || `aff-${affinityId}@lp.local`;
    // dedupeKey = normalized email (prod convention) so this person matches the
    // existing investor DB on ingest; aff-<id> fallback when no real email.
    const dedupeKey = normalizeEmailKey(realEmail) || `aff-${affinityId}`;
    const firms = entryFirmNames(ent);

    // Best (warmest) firm across this person's companies.
    let best: FirmProximity | null = null;
    for (const fn of firms) {
      const fp = firmByLabel.get(norm(fn));
      if (!fp) continue;
      if (!best || proximityRank(fp.code, fp.hasPath) < proximityRank(best.code, best.hasPath)) {
        best = fp;
      }
    }
    const firmLabel = best?.label ?? firms[0] ?? '';
    const hasPath = best?.hasPath ?? false;
    const bestCode = hasPath ? best!.code : null;

    const prest = prestige.get(norm(`${firstName} ${lastName}`)) ?? null;
    const enrichment = prest ? toEnrichment(prest) : undefined;
    if (enrichment) enriched += 1;

    // Upsert by investorId — a person may already exist via the Gold list
    // (shared Affinity id). Update keeps this list's name/firm/enrichment current.
    await prisma.investorOutreachRecord.upsert({
      where: { investorId: affinityId },
      update: {
        firstName,
        lastName,
        firm: firmLabel,
        enrichmentStatus: enrichment ? 'enriched' : 'pending',
        bestProximityCode: bestCode,
        hasPath,
        rawPayload: enrichment ? ({ enrichment } as Prisma.InputJsonValue) : undefined,
      },
      create: {
        investorId: affinityId, // Affinity entity id = the authoritative LP id
        dedupeKey, // normalized email (prod-shaped) — see normalizeEmailKey
        canonicalId: affinityId,
        source: NEW_SOURCE,
        firstName,
        lastName,
        email,
        emailStatus: 'unverified',
        firm: firmLabel,
        investorType: 'fund',
        stageFocus: '',
        engagementTier: '',
        enrichmentStatus: enrichment ? 'enriched' : 'pending',
        bestProximityCode: bestCode,
        hasPath,
        rawPayload: enrichment ? ({ enrichment } as Prisma.InputJsonValue) : undefined,
      },
    });
    created += 1;

    // Copy the best firm's paths onto this person (target = affinity id).
    if (best && hasPath) {
      reachable += 1;
      const firmPaths = pathsByFirm.get(best.firmId) ?? [];
      for (const p of firmPaths) {
        await prisma.pathfinderPath.create({
          data: {
            targetInvestorId: affinityId,
            targetSet: TARGET_SET,
            connectorType: p.connectorType,
            hops: p.hops,
            caliber: p.caliber,
            proximityCode: p.proximityCode,
            score: p.score,
            caliberConfidence: p.caliberConfidence,
            hopChain: p.hopChain as Prisma.InputJsonValue,
            rank: p.rank,
            ingestRunId: RUN_ID,
          },
        });
        pathRows += 1;
      }
    }
  }

  return { created, reachable, enriched, pathRows, ids: [...seenAffinity] };
}

async function repointListAndMembers(ids: string[]): Promise<number> {
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
    where: { investorId: { in: ids } },
    select: { id: true },
  });
  await prisma.investorListMembership.createMany({
    data: records.map((r) => ({
      listId: list.id,
      investorOutreachRecordId: r.id,
      addedByEmail: 'seed@local',
      note: 'Seeded from the real Neuro Fund I LP run (person-grain).',
    })),
    skipDuplicates: true,
  });
  return records.length;
}

async function main() {
  console.log('Purging demo cohort + prior real run…');
  await cleanup();
  console.log('Creating person-grain LP records + paths…');
  const { created, reachable, enriched, pathRows, ids } = await seed();
  console.log('Repointing neuro-lp list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Real Neuro LP seed (person-grain) complete —');
  console.log(
    `people: ${created} | reachable (has warm path): ${reachable} | enriched: ${enriched} | ` +
      `path rows: ${pathRows} | neuro-lp members: ${members}`,
  );
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

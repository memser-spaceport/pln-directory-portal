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
 * Duplicates: when a dedupeKey (email) already belongs to a record with a
 * DIFFERENT investorId, the seed does NOT overwrite that record's identity.
 * It writes a PathfinderEntityCrosswalk row (needsReview=true) so the match
 * shows up in the Crosswalk Review panel for human confirmation, keeps the
 * existing record as canonical, and attaches this run's warm paths to it.
 *
 * Reads the runner dump + Affinity raw pull + prestige cache from local scratch
 * (PII, never committed). NOT for production. Run via `npm run api:seed-pathfinder-neuro`.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'neuro-fund-i';
const NEW_SOURCE = 'PATHFINDER_NEURO';
const DEMO_SOURCE = 'DEMO_PATHFINDER';
const DEMO_TARGET_SET = 'demo-neuro-lp';
const DEMO_RUN_ID = 'demo-seed';
const RUN_ID = 'neuro-person-seed';
const LIST_SLUG = 'neuro-lp';

const DEFAULT_SCRATCH = path.resolve(__dirname, '../../../../..', 'seed_data', 'path_finder');
const SCRATCH_DIR = process.env.PATHFINDER_SCRATCH_DIR || DEFAULT_SCRATCH;
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_dump.json`;
const AFFINITY_PATH = `${SCRATCH_DIR}/_affinity_352080.json`;
const PRESTIGE_PATH = process.env.PATHFINDER_PRESTIGE_CACHE || `${SCRATCH_DIR}/_lp_prestige_cache.json`;
// Per-LP PL venture-team connector (relationship axis), keyed by Affinity person
// id — precomputed by pln-data-enrichment scripts/pull-affinity-pl-relationships.ts.
const PL_REL_PATH = `${SCRATCH_DIR}/_pl_relationships_352080.json`;

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
/**
 * One LP's PL-team connector, as written by pull-affinity-pl-relationships.ts
 * (shape mirrors PlTeamRelationship). Only `summary` + `bestConnector` are used
 * here — they are grafted onto the person's hop chain. Loose by design (scratch JSON).
 */
interface PlRelEntry {
  summary: string | null;
  bestConnector: Record<string, unknown> | null;
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

/**
 * Per-LP PL-team connectors keyed by Affinity person id. Optional input: if the
 * relationship pull hasn't been run, return an empty map and skip attribution
 * (the run still succeeds — connector copy just won't appear).
 */
function loadPlConnectors(): Map<string, PlRelEntry> {
  try {
    const raw = JSON.parse(readFileSync(PL_REL_PATH, 'utf-8')) as Record<string, PlRelEntry>;
    return new Map(Object.entries(raw));
  } catch {
    console.warn(`(no ${PL_REL_PATH} — PL-team connector attribution skipped)`);
    return new Map();
  }
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
  // Delete ONLY rows this seed created itself (createdAt ~ updatedAt at creation).
  // Rows that pre-existed in the investor DB and were absorbed by a pre-fix run
  // (their source was overwritten to PATHFINDER_NEURO) have a drifted updatedAt —
  // sparing them preserves real investor data; the seed loop below re-matches
  // them by dedupeKey and updates in place instead of delete+recreate.
  await prisma.$executeRaw`
    DELETE FROM "InvestorOutreachRecord"
    WHERE source IN (${DEMO_SOURCE}, ${NEW_SOURCE})
      AND "updatedAt" - "createdAt" < interval '1 minute'`;
}

async function seed() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
  const prestige = loadPrestigeByName();
  const plConnectors = loadPlConnectors();
  let personsWithConnector = 0;

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

  const entries = (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: AffinityEntry[] }).entries ?? [];

  // ── Pass 1 (pure memory): classify every entry against a one-shot snapshot
  // of existing records. All writes happen in bulk afterwards — the previous
  // row-by-row awaits cost 3-5 round-trips per person and took minutes over a
  // remote DB.
  console.log(`Snapshotting existing records…`);
  type ExistingRef = { id: number; dedupeKey: string; investorId: string };
  const existingRows: ExistingRef[] = await prisma.investorOutreachRecord.findMany({
    select: { id: true, dedupeKey: true, investorId: true },
  });
  const byDedupeKey = new Map<string, ExistingRef>(existingRows.map((r) => [r.dedupeKey, r]));
  const byInvestorId = new Map<string, ExistingRef>(existingRows.map((r) => [r.investorId, r]));
  const PENDING_ID = -1; // marks rows queued for creation in this run

  let duplicates = 0;
  let reachable = 0;
  let enriched = 0;
  const seenAffinity = new Set<string>();
  /** investorIds to enroll in the neuro-lp list (the existing record's id when a duplicate was detected). */
  const memberIds: string[] = [];

  const creates: Prisma.InvestorOutreachRecordCreateManyInput[] = [];
  const createByInvestorId = new Map<string, Prisma.InvestorOutreachRecordCreateManyInput>();
  const updates: { id: number; data: Prisma.InvestorOutreachRecordUpdateInput }[] = [];
  const crosswalkRows: Prisma.PathfinderEntityCrosswalkCreateManyInput[] = [];
  const pathInserts: Prisma.PathfinderPathCreateManyInput[] = [];
  /** investorIds whose paths are already queued this run (avoid double-attach). */
  const pathTargetsQueued = new Set<string>();
  /** Duplicate matches that may need this run's paths attached to the existing record. */
  const dupPathCandidates: { investorId: string; firmId: string; bestCode: string }[] = [];

  const queuePaths = (targetInvestorId: string, firmId: string) => {
    // Relationship-axis graft: this person's PL-team connector (keyed by their
    // Affinity id). Person-grain — the firm-grain runner can't carry it.
    const rel = plConnectors.get(targetInvestorId);
    let attachedHere = false;
    for (const p of pathsByFirm.get(firmId) ?? []) {
      let hopChain = p.hopChain;
      if (rel?.bestConnector && rel.summary) {
        // Clone first — the same firm hop-chain object is shared across everyone
        // at the firm, so in-place mutation would leak to other people. JSON
        // round-trip: the hop chain is plain JSON and small.
        const hc = JSON.parse(JSON.stringify(p.hopChain)) as {
          explanation?: string;
          plConnector?: unknown;
        };
        hc.explanation = hc.explanation ? `${hc.explanation} ${rel.summary}.` : `${rel.summary}.`;
        hc.plConnector = rel.bestConnector;
        hopChain = hc;
        attachedHere = true;
      }
      pathInserts.push({
        targetInvestorId,
        targetSet: TARGET_SET,
        connectorType: p.connectorType,
        hops: p.hops,
        caliber: p.caliber,
        proximityCode: p.proximityCode,
        score: p.score,
        caliberConfidence: p.caliberConfidence,
        hopChain: hopChain as Prisma.InputJsonValue,
        rank: p.rank,
        ingestRunId: RUN_ID,
      });
    }
    if (attachedHere) personsWithConnector += 1;
    pathTargetsQueued.add(targetInvestorId);
  };

  console.log(`Processing ${entries.length} Affinity entries…`);
  for (const e of entries) {
    const ent = e.entity;
    const affinityId = String(ent.id);
    if (!affinityId || seenAffinity.has(affinityId)) continue;
    seenAffinity.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail =
      (ent.primaryEmailAddress ?? '').trim() || (Array.isArray(ent.emailAddresses) ? ent.emailAddresses[0] : '') || '';
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
    const bestCode = best && hasPath ? best.code : null;

    const prest = prestige.get(norm(`${firstName} ${lastName}`)) ?? null;
    const enrichment = prest ? toEnrichment(prest) : undefined;
    if (enrichment) enriched += 1;

    // Match by dedupeKey (prod convention) — a person may already exist via the
    // Gold list (same Affinity id) or the wider investor DB (same email).
    const existing = byDedupeKey.get(dedupeKey) ?? byInvestorId.get(affinityId);

    if (existing && existing.investorId !== affinityId) {
      // Same email, DIFFERENT id: a duplicate entity, not this run's row. Never
      // steal the existing record's identity (the silent upsert here is what
      // rewrote 49 pre-existing investors on dev) — queue the match for human
      // confirmation in the crosswalk review instead, and keep the existing
      // record as canonical.
      duplicates += 1;
      console.log(
        `  duplicate: affinity ${affinityId} (${firstName} ${lastName}) shares email with existing ` +
          `${existing.investorId} — queued for crosswalk review`
      );
      crosswalkRows.push({
        canonicalId: existing.investorId,
        affinityId,
        investorId: existing.investorId,
        entityType: 'person',
        displayName: `${firstName} ${lastName}`.trim() || null,
        firm: firmLabel || null,
        matchMethod: 'email',
        matchConfidence: 0.95,
        isConfirmed: false,
        needsReview: true,
        ingestRunId: RUN_ID,
      });
      if (best && hasPath) {
        dupPathCandidates.push({ investorId: existing.investorId, firmId: best.firmId, bestCode: best.code });
      }
      memberIds.push(existing.investorId);
      continue;
    }

    // Same Affinity id (re-run / Gold-shared person) or brand new. On update,
    // leave source untouched so Gold-first shared people stay gold-sourced (and
    // each seed's cleanup only ever deletes its own rows).
    const recordFields = {
      investorId: affinityId,
      canonicalId: affinityId,
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
    };
    if (existing) {
      updates.push({ id: existing.id, data: recordFields });
    } else {
      const createInput = { dedupeKey, source: NEW_SOURCE, ...recordFields };
      creates.push(createInput);
      createByInvestorId.set(affinityId, createInput);
      const pending: ExistingRef = { id: PENDING_ID, dedupeKey, investorId: affinityId };
      byDedupeKey.set(dedupeKey, pending);
      byInvestorId.set(affinityId, pending);
    }
    memberIds.push(affinityId);

    // Copy the best firm's paths onto this person (target = affinity id).
    if (best && hasPath) {
      reachable += 1;
      queuePaths(affinityId, best.firmId);
    }
  }

  // ── Pass 2: surface this run's warm paths on duplicate-matched existing
  // records that have none. One grouped count instead of one count per match;
  // count actual rows (not the hasPath flag) since cleanup() purges this target
  // set's paths each run.
  const candidateIds = [...new Set(dupPathCandidates.map((d) => d.investorId))].filter(
    (id) => !pathTargetsQueued.has(id)
  );
  const pathCounts = candidateIds.length
    ? await prisma.pathfinderPath.groupBy({
        by: ['targetInvestorId'],
        where: { targetInvestorId: { in: candidateIds } },
        _count: { _all: true },
      })
    : [];
  const alreadyHasPaths = new Set(pathCounts.map((c) => c.targetInvestorId));
  for (const d of dupPathCandidates) {
    if (pathTargetsQueued.has(d.investorId) || alreadyHasPaths.has(d.investorId)) continue;
    reachable += 1;
    queuePaths(d.investorId, d.firmId);
    const pendingCreate = createByInvestorId.get(d.investorId);
    if (pendingCreate) {
      pendingCreate.bestProximityCode = d.bestCode;
      pendingCreate.hasPath = true;
    } else {
      const ref = byInvestorId.get(d.investorId);
      if (ref && ref.id !== PENDING_ID) {
        updates.push({ id: ref.id, data: { bestProximityCode: d.bestCode, hasPath: true } });
      }
    }
  }

  // ── Pass 3: bulk writes. Records before paths (paths FK onto investorId).
  console.log(
    `Writing ${creates.length} new records, ${updates.length} updates, ` +
      `${pathInserts.length} paths, ${crosswalkRows.length} crosswalk rows…`
  );
  console.log(
    `  PL-team connector attached to ${personsWithConnector} people` +
      (plConnectors.size ? ` (of ${plConnectors.size} LPs in the relationship file)` : ' (no relationship file)')
  );
  if (creates.length > 0) {
    await prisma.investorOutreachRecord.createMany({ data: creates, skipDuplicates: true });
  }
  const UPDATE_CHUNK = 100;
  for (let i = 0; i < updates.length; i += UPDATE_CHUNK) {
    await prisma.$transaction(
      updates
        .slice(i, i + UPDATE_CHUNK)
        .map((u) => prisma.investorOutreachRecord.update({ where: { id: u.id }, data: u.data }))
    );
  }
  const PATH_CHUNK = 500;
  for (let i = 0; i < pathInserts.length; i += PATH_CHUNK) {
    await prisma.pathfinderPath.createMany({ data: pathInserts.slice(i, i + PATH_CHUNK) });
  }
  if (crosswalkRows.length > 0) {
    await prisma.pathfinderEntityCrosswalk.createMany({ data: crosswalkRows });
  }

  return {
    created: creates.length,
    updated: updates.length,
    duplicates,
    reachable,
    enriched,
    pathRows: pathInserts.length,
    ids: memberIds,
  };
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
  const { created, updated, duplicates, reachable, enriched, pathRows, ids } = await seed();
  console.log('Repointing neuro-lp list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Real Neuro LP seed (person-grain) complete —');
  console.log(
    `created: ${created} | updated in place: ${updated} | ` +
      `duplicates (queued for crosswalk review): ${duplicates} | ` +
      `reachable (has warm path): ${reachable} | enriched: ${enriched} | ` +
      `path rows: ${pathRows} | neuro-lp members: ${members}`
  );
  if (duplicates > 0) {
    console.log('Review the duplicate matches in the Investor DB → Crosswalk review panel.');
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

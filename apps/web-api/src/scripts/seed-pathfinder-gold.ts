/**
 * LOCAL-ONLY ingest of the Gold PLC Co-Investors run into the Investor DB.
 *
 * PERSON-GRAIN (the Gold list 183682 is a person list): rows are PEOPLE
 * (contacts at co-investor firms), identified by their Affinity entity id. Each
 * person inherits the proximity of their FIRM (best across firms). No prestige
 * enrichment — Gold caliber is relationship-only by design.
 *
 * Idempotent: purge prior gold run + its paths, create person records keyed by
 * Affinity id with person-keyed PathfinderPath rows copied from each person's best
 * firm, repoint + graph the gold-coinvestors list, set membership.
 *
 * Needs the gold runner dump (with firm_label) — regenerate via
 *   cd pln-data-enrichment/apps/data-enrichment && npx ts-node scripts/run-pathfinder-gold.ts
 * Reads scratch (firm names — never committed). NOT for production.
 * Run via `npm run api:seed-pathfinder-gold`.
 */
import { readFileSync } from 'fs';
import { PrismaClient, Prisma } from '@prisma/client';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

const TARGET_SET = 'gold-co-investors';
const SOURCE = 'PATHFINDER_GOLD';
const RUN_ID = 'gold-person-seed';
const LIST_SLUG = 'gold-coinvestors';

const SCRATCH_DIR = resolvePathfinderScratchDir();
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_gold_dump.json`;
const AFFINITY_PATH = `${SCRATCH_DIR}/_affinity_183682.json`;

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

const norm = (s: string | null | undefined): string =>
  (s ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Prod dedupe_key form: normalized email (lowercase, trim, plus-tag stripped). */
function normalizeEmailKey(email: string | null | undefined): string {
  const raw = (email ?? '').trim().toLowerCase();
  const at = raw.indexOf('@');
  if (at <= 0 || at === raw.length - 1) return '';
  const local = raw.slice(0, at).split('+')[0];
  if (!local) return '';
  return `${local}@${raw.slice(at + 1)}`;
}

function entryFirmNames(entity: AffinityEntity): string[] {
  const comp = (entity.fields ?? []).find((f) => f.id === 'companies');
  const data = comp?.value?.data;
  if (!Array.isArray(data)) return [];
  return data
    .map((d) => (d && typeof d === 'object' ? (d as { name?: unknown }).name : null))
    .filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
}

function proximityRank(code: string | null, hasPath: boolean): number {
  if (!hasPath || !code) return 1e9;
  const m = /\+(\d)([AB])/.exec(code);
  if (!m) return 1e6;
  const caliber = m[2] === 'A' ? 0 : 1;
  return caliber * 100 + parseInt(m[1], 10);
}

interface FirmProximity {
  firmId: string;
  label: string;
  code: string;
  hasPath: boolean;
}

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({ where: { targetSet: TARGET_SET } });
  await prisma.pathfinderEntityCrosswalk.deleteMany({ where: { ingestRunId: RUN_ID } });
  // Delete ONLY rows this seed created itself (createdAt ~ updatedAt at creation);
  // pre-existing investor rows absorbed by a pre-fix run are spared and re-matched
  // by dedupeKey in the loop below. See seed-pathfinder-neuro.ts cleanup().
  await prisma.$executeRaw`
    DELETE FROM "InvestorOutreachRecord"
    WHERE source = ${SOURCE}
      AND "updatedAt" - "createdAt" < interval '1 minute'`;
}

async function seed() {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
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

  const entries =
    (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: { entity: AffinityEntity }[] }).entries ?? [];

  // ── Pass 1 (pure memory): classify every entry against a one-shot snapshot
  // of existing records, then write in bulk — row-by-row awaits took minutes
  // over a remote DB. Mirrors seed-pathfinder-neuro.ts.
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
  const seen = new Set<string>();
  /** investorIds to enroll in the gold list (the existing record's id when a duplicate was detected). */
  const memberIds: string[] = [];

  const creates: Prisma.InvestorOutreachRecordCreateManyInput[] = [];
  const createByInvestorId = new Map<string, Prisma.InvestorOutreachRecordCreateManyInput>();
  const updates: { id: number; data: Prisma.InvestorOutreachRecordUpdateInput }[] = [];
  const crosswalkRows: Prisma.PathfinderEntityCrosswalkCreateManyInput[] = [];
  const pathInserts: Prisma.PathfinderPathCreateManyInput[] = [];
  const pathTargetsQueued = new Set<string>();
  const dupPathCandidates: { investorId: string; firmId: string; bestCode: string }[] = [];

  const queuePaths = (targetInvestorId: string, firmId: string) => {
    for (const p of pathsByFirm.get(firmId) ?? []) {
      pathInserts.push({
        targetInvestorId,
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
      });
    }
    pathTargetsQueued.add(targetInvestorId);
  };

  console.log(`Processing ${entries.length} Affinity entries…`);
  for (const e of entries) {
    const ent = e.entity;
    const affinityId = String(ent.id);
    if (!affinityId || seen.has(affinityId)) continue;
    seen.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail =
      (ent.primaryEmailAddress ?? '').trim() || (Array.isArray(ent.emailAddresses) ? ent.emailAddresses[0] : '') || '';
    const email = realEmail || `aff-${affinityId}@gold.local`;
    const dedupeKey = normalizeEmailKey(realEmail) || `aff-${affinityId}`;
    const firms = entryFirmNames(ent);

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

    // Match by dedupeKey — a person may already exist via the Neuro list (same
    // Affinity id) or the wider investor DB (same email).
    const existing = byDedupeKey.get(dedupeKey) ?? byInvestorId.get(affinityId);

    if (existing && existing.investorId !== affinityId) {
      // Same email, DIFFERENT id: a duplicate entity. Never overwrite the
      // existing record's identity — queue the match for human confirmation in
      // the crosswalk review and keep the existing record as canonical.
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

    // Same Affinity id (re-run / Neuro-shared person) or brand new. On update,
    // leave source untouched so neuro-first shared people stay neuro-sourced.
    if (existing) {
      updates.push({
        id: existing.id,
        data: { firstName, lastName, email, firm: firmLabel, bestProximityCode: bestCode, hasPath },
      });
    } else {
      const createInput: Prisma.InvestorOutreachRecordCreateManyInput = {
        dedupeKey,
        investorId: affinityId,
        canonicalId: affinityId,
        source: SOURCE,
        firstName,
        lastName,
        email,
        emailStatus: 'unverified',
        firm: firmLabel,
        investorType: 'fund',
        stageFocus: '',
        engagementTier: '',
        enrichmentStatus: 'pending',
        bestProximityCode: bestCode,
        hasPath,
      };
      creates.push(createInput);
      createByInvestorId.set(affinityId, createInput);
      const pending: ExistingRef = { id: PENDING_ID, dedupeKey, investorId: affinityId };
      byDedupeKey.set(dedupeKey, pending);
      byInvestorId.set(affinityId, pending);
    }
    memberIds.push(affinityId);

    if (best && hasPath) {
      reachable += 1;
      queuePaths(affinityId, best.firmId);
    }
  }

  // ── Pass 2: attach this run's paths to duplicate-matched existing records
  // that have none (one grouped count instead of one count per match).
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
    pathRows: pathInserts.length,
    ids: memberIds,
  };
}

async function repointListAndMembers(ids: string[]): Promise<number> {
  const list = await prisma.investorList.upsert({
    where: { slug: LIST_SLUG },
    update: { isGraphed: true, targetSet: TARGET_SET, externalRef: '183682' },
    create: {
      slug: LIST_SLUG,
      name: 'Gold PLC Co-Investors',
      description: 'PLC Gold-tier co-investors. Proximity is graphed for this list.',
      source: 'affinity',
      externalRef: '183682',
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
      note: 'Seeded from the Gold co-investors run (person-grain).',
    })),
    skipDuplicates: true,
  });
  return records.length;
}

async function main() {
  console.log('Purging prior gold run…');
  await cleanup();
  console.log('Creating person-grain gold records + paths…');
  const { created, updated, duplicates, reachable, pathRows, ids } = await seed();
  console.log('Repointing gold-coinvestors list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Gold seed (person-grain) complete —');
  console.log(
    `created: ${created} | updated in place: ${updated} | ` +
      `duplicates (queued for crosswalk review): ${duplicates} | ` +
      `reachable: ${reachable} | path rows: ${pathRows} | members: ${members}`
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

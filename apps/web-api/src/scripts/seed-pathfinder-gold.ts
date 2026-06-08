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
import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'gold-co-investors';
const SOURCE = 'PATHFINDER_GOLD';
const RUN_ID = 'gold-person-seed';
const LIST_SLUG = 'gold-coinvestors';

const DEFAULT_SCRATCH = path.resolve(__dirname, '../../../../..', 'seed_data', 'path_finder');
const SCRATCH_DIR = process.env.PATHFINDER_SCRATCH_DIR || DEFAULT_SCRATCH;
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
  await prisma.investorOutreachRecord.deleteMany({ where: { source: SOURCE } });
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
    (JSON.parse(readFileSync(AFFINITY_PATH, 'utf-8')) as { entries?: { entity: AffinityEntity }[] })
      .entries ?? [];

  let created = 0;
  let reachable = 0;
  let pathRows = 0;
  const seen = new Set<string>();

  for (const e of entries) {
    const ent = e.entity;
    const affinityId = String(ent.id);
    if (!affinityId || seen.has(affinityId)) continue;
    seen.add(affinityId);

    const firstName = (ent.firstName ?? '').trim();
    const lastName = (ent.lastName ?? '').trim();
    const realEmail =
      (ent.primaryEmailAddress ?? '').trim() ||
      (Array.isArray(ent.emailAddresses) ? ent.emailAddresses[0] : '') ||
      '';
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

    // Upsert by investorId — a person may already exist via the Neuro list
    // (shared Affinity id). Reuse the record; just add gold paths + membership.
    await prisma.investorOutreachRecord.upsert({
      where: { investorId: affinityId },
      update: {},
      create: {
        investorId: affinityId,
        dedupeKey, // normalized email (prod-shaped)
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
        bestProximityCode: hasPath ? best!.code : null,
        hasPath,
      },
    });
    created += 1;

    if (best && hasPath) {
      reachable += 1;
      for (const p of pathsByFirm.get(best.firmId) ?? []) {
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
  return { created, reachable, pathRows, ids: [...seen] };
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
  const { created, reachable, pathRows, ids } = await seed();
  console.log('Repointing gold-coinvestors list + membership…');
  const members = await repointListAndMembers(ids);
  console.log('— Gold seed (person-grain) complete —');
  console.log(`people: ${created} | reachable: ${reachable} | path rows: ${pathRows} | members: ${members}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

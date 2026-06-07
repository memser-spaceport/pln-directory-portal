/**
 * LOCAL-ONLY ingest of the Gold PLC Co-Investors run into the Investor DB, so the
 * gold-coinvestors list shows proximity (it ships ungraphed by default).
 *
 * Idempotent:
 *   1. Purges prior gold pathfinder paths + the prior gold run records
 *      (source=PATHFINDER_GOLD).
 *   2. Creates one InvestorOutreachRecord per gold firm target in the gold runner
 *      dump (investorId = the gold_* id — the FK the pathfinder ingest needs).
 *   3. Repoints the gold-coinvestors list at targetSet=gold-co-investors (the gold
 *      runner's set), flips isGraphed=true, replaces membership with the records.
 *
 * Does NOT create paths — run the gold runner with --post AFTER this:
 *   cd pln-data-enrichment/apps/data-enrichment && npx ts-node scripts/run-pathfinder-gold.ts --post
 *
 * Gold targets are co-investor FIRMS, so there is no contact-prestige enrichment
 * (that pass enriched LP persons); caliber is relationship-only by design.
 *
 * Reads the gold runner dump from local scratch (firm names — never committed).
 * NOT for production. Run via `npm run api:seed-pathfinder-gold`.
 */
import { readFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_SET = 'gold-co-investors';
const SOURCE = 'PATHFINDER_GOLD';
const LIST_SLUG = 'gold-coinvestors';

// Override via env on a different machine; default is this operator's local layout.
const SCRATCH_DIR =
  process.env.PATHFINDER_SCRATCH_DIR ||
  'C:/Users/anpan/code/claudecode/investor_paths_work/pplx_paths';
const DUMP_PATH = `${SCRATCH_DIR}/_pathfinder_gold_dump.json`;

interface DumpSummary {
  investor_id: string;
  best_proximity_code: string;
  has_path: boolean;
}
interface Dump {
  targetSet: string;
  summaries: DumpSummary[];
}

/** gold_pony_shiny -> "Pony Shiny"; gold_arteriacapital -> "Arteriacapital". */
function deslug(id: string): string {
  return id
    .replace(/^gold_/, '')
    .split('_')
    .filter(Boolean)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

async function cleanup() {
  await prisma.pathfinderPath.deleteMany({ where: { targetSet: TARGET_SET } });
  await prisma.investorOutreachRecord.deleteMany({ where: { source: SOURCE } });
}

async function seedRecords(): Promise<number> {
  const dump = JSON.parse(readFileSync(DUMP_PATH, 'utf-8')) as Dump;
  if (dump.targetSet !== TARGET_SET) {
    throw new Error(`dump targetSet "${dump.targetSet}" != expected "${TARGET_SET}"`);
  }
  let created = 0;
  for (const s of dump.summaries) {
    await prisma.investorOutreachRecord.create({
      data: {
        investorId: s.investor_id,
        dedupeKey: s.investor_id,
        canonicalId: s.investor_id,
        source: SOURCE,
        firstName: '',
        lastName: '',
        email: `${s.investor_id}@gold.local`,
        emailStatus: 'unverified',
        firm: deslug(s.investor_id),
        investorType: 'fund',
        stageFocus: '',
        engagementTier: '',
        enrichmentStatus: 'pending',
        bestProximityCode: s.has_path ? s.best_proximity_code : null,
        hasPath: s.has_path,
      },
    });
    created += 1;
  }
  return created;
}

async function repointListAndMembers(): Promise<number> {
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
    where: { source: SOURCE },
    select: { id: true },
  });
  await prisma.investorListMembership.createMany({
    data: records.map((r) => ({
      listId: list.id,
      investorOutreachRecordId: r.id,
      addedByEmail: 'seed@local',
      note: 'Seeded from the Gold co-investors run.',
    })),
    skipDuplicates: true,
  });
  return records.length;
}

async function main() {
  console.log('Purging prior gold run…');
  await cleanup();
  console.log('Creating gold firm records from the gold runner dump…');
  const created = await seedRecords();
  console.log('Repointing gold-coinvestors list + membership…');
  const members = await repointListAndMembers();
  console.log('— Gold seed complete —');
  console.log(`records: ${created} | gold-coinvestors members: ${members}`);
  console.log('NEXT: run the gold runner with --post to attach paths + proximity codes.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

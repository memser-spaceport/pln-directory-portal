/**
 * Seed for Investor Lists (the curated target sets behind the warm-intros workspace).
 *
 * Creates the two v1 lists:
 *   - "Neuro Fund I LP Pipeline"  (slug neuro-lp)        — graphed, targetSet=demo-neuro-lp
 *   - "Gold PLC Co-Investors"     (slug gold-coinvestors) — not yet graphed
 *
 * Then adds every existing source='DEMO_PATHFINDER' investor as a member of
 * neuro-lp so the FE/QA has populated list members out of the box. The
 * demo-neuro-lp targetSet matches the pathfinder demo seed
 * (seed-pathfinder-demo.ts), so per-list proximity codes resolve.
 *
 * Idempotent: upserts the lists by slug and skips memberships that already exist.
 * Run via `npm run api:seed-investor-lists` (run the pathfinder demo seed first
 * so there are DEMO_PATHFINDER investors to attach).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const NEURO_TARGET_SET = 'demo-neuro-lp';
const DEMO_SOURCE = 'DEMO_PATHFINDER';

const LISTS = [
  {
    slug: 'neuro-lp',
    name: 'Neuro Fund I LP Pipeline',
    description: 'Curated LP pipeline for Neuro Fund I. Proximity is graphed for this list.',
    source: 'affinity',
    externalRef: '352080', // Affinity list "PLC Neurotech Fund I — LP Pipeline"
    isGraphed: true,
    targetSet: NEURO_TARGET_SET,
  },
  {
    slug: 'gold-coinvestors',
    name: 'Gold PLC Co-Investors',
    description: 'PLC Gold-tier co-investors. Not yet graphed for proximity.',
    source: 'affinity',
    externalRef: '183682', // Affinity "Gold Co-Investors" person list
    isGraphed: false,
    targetSet: 'gold-coinvestors',
  },
] as const;

async function upsertLists() {
  const bySlug: Record<string, number> = {};
  for (const list of LISTS) {
    const row = await prisma.investorList.upsert({
      where: { slug: list.slug },
      update: {
        name: list.name,
        description: list.description,
        source: list.source,
        externalRef: list.externalRef,
        isGraphed: list.isGraphed,
        targetSet: list.targetSet,
      },
      create: {
        slug: list.slug,
        name: list.name,
        description: list.description,
        source: list.source,
        externalRef: list.externalRef,
        isGraphed: list.isGraphed,
        targetSet: list.targetSet,
      },
    });
    bySlug[list.slug] = row.id;
  }
  return bySlug;
}

async function seedNeuroMembers(neuroListId: number) {
  const investors = await prisma.investorOutreachRecord.findMany({
    where: { source: DEMO_SOURCE },
    select: { id: true },
  });

  let added = 0;
  for (const inv of investors) {
    const result = await prisma.investorListMembership.createMany({
      data: [
        {
          listId: neuroListId,
          investorOutreachRecordId: inv.id,
          addedByEmail: 'seed@local',
          note: 'Seeded from DEMO_PATHFINDER cohort.',
        },
      ],
      skipDuplicates: true,
    });
    added += result.count;
  }
  return { universe: investors.length, added };
}

async function counts(bySlug: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [slug, id] of Object.entries(bySlug)) {
    out[slug] = await prisma.investorListMembership.count({ where: { listId: id } });
  }
  return out;
}

async function main() {
  console.log('Upserting investor lists…');
  const bySlug = await upsertLists();
  console.log('Attaching DEMO_PATHFINDER investors to neuro-lp…');
  const memberResult = await seedNeuroMembers(bySlug['neuro-lp']);
  const memberCounts = await counts(bySlug);
  console.log('— Investor lists seed complete —');
  console.log(`lists: ${LISTS.length} (neuro-lp graphed, gold-coinvestors not graphed)`);
  console.log(`DEMO_PATHFINDER universe: ${memberResult.universe} | new memberships added: ${memberResult.added}`);
  console.log(`member counts: ${JSON.stringify(memberCounts)}`);
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

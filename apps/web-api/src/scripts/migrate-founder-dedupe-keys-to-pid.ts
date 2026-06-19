/**
 * Re-key FounderSourcingRecord dedupe keys to pid:<founderId> for signal-sourcing ingest compatibility.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register apps/web-api/src/scripts/migrate-founder-dedupe-keys-to-pid.ts
 *   npx ts-node -r tsconfig-paths/register apps/web-api/src/scripts/migrate-founder-dedupe-keys-to-pid.ts --apply
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const apply = process.argv.includes('--apply');
  const rows = await prisma.founderSourcingRecord.findMany({
    select: { id: true, founderId: true, dedupeKey: true },
  });

  const toMigrate = rows.filter((r) => !r.dedupeKey.startsWith('pid:'));
  const targetByFounder = new Map(toMigrate.map((r) => [r.founderId, `pid:${r.founderId}`]));

  const conflicts: string[] = [];
  for (const row of rows) {
    const target = `pid:${row.founderId}`;
    if (row.dedupeKey === target) continue;
    const occupant = rows.find((r) => r.dedupeKey === target && r.id !== row.id);
    if (occupant) {
      conflicts.push(
        `founderId=${row.founderId}: target ${target} already used by id=${occupant.id} (dedupe=${occupant.dedupeKey})`
      );
    }
  }

  console.log(`Found ${toMigrate.length} row(s) to re-key (${rows.length} total).`);
  if (conflicts.length > 0) {
    console.error('Conflicts — resolve manually before applying:');
    for (const c of conflicts) console.error(`  - ${c}`);
    process.exit(1);
  }

  if (!apply) {
    console.log('Dry run — pass --apply to update.');
    for (const row of toMigrate.slice(0, 10)) {
      console.log(`  ${row.dedupeKey} -> pid:${row.founderId}`);
    }
    if (toMigrate.length > 10) console.log(`  ... and ${toMigrate.length - 10} more`);
    return;
  }

  let updated = 0;
  for (const row of toMigrate) {
    const nextKey = targetByFounder.get(row.founderId)!;
    await prisma.founderSourcingRecord.update({
      where: { id: row.id },
      data: { dedupeKey: nextKey },
    });
    updated++;
  }
  console.log(`Re-keyed ${updated} row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

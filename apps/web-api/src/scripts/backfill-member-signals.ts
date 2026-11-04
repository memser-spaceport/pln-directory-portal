/**
 * Copy the stored member action records into the member signal log (LAB-3121).
 * Run once per environment after the MemberSignal migration is deployed.
 *
 *   yarn api:backfill-member-signals                 # dry-run: counts only
 *   yarn api:backfill-member-signals --apply         # write
 *   yarn api:backfill-member-signals --apply --batch=500
 *
 * Safe to re-run: rows are keyed by `backfill:<table>:<uid>` and inserted with
 * skipDuplicates, so a second run adds nothing.
 */
import { PrismaClient } from '@prisma/client';
import { runMemberSignalBackfill } from '../member-signals/member-signals-backfill';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const batchArg = process.argv.find((arg) => arg.startsWith('--batch='));
  const batchSize = batchArg ? Number(batchArg.split('=')[1]) : 1000;
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error(`Invalid --batch: ${batchArg}`);

  console.log(`Member signal backfill (${apply ? 'APPLY' : 'dry-run'}, batch ${batchSize})`);
  const results = await runMemberSignalBackfill(prisma, { apply, batchSize, log: (line) => console.log(line) });
  const total = results.reduce((sum, r) => sum + r.inserted, 0);
  console.log(`${apply ? 'Inserted' : 'Would insert'} ${total} rows.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

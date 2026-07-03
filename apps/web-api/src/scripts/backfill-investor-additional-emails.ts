/**
 * Backfill InvestorOutreachRecord.additionalEmails from Affinity exports and
 * AffinityPerson sidecar rows.
 *
 *   npm run api:backfill-investor-additional-emails           # dry-run (default)
 *   npm run api:backfill-investor-additional-emails -- --apply
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  normalizeEmailKey,
  resolveAdditionalEmails,
  resolvePrimaryEmail,
  type InvestorEmailSource,
} from '../investor-outreach/investor-email.util';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

const AFFINITY_LIST_FILES = ['_affinity_352080.json', '_affinity_183682.json'];

interface AffinityEntity extends InvestorEmailSource {
  id: number | string;
}

function loadAffinityAdditionalByInvestorId(scratchDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const file of AFFINITY_LIST_FILES) {
    const path = join(scratchDir, file);
    if (!existsSync(path)) {
      console.warn(`  skip missing ${path}`);
      continue;
    }
    const data = JSON.parse(readFileSync(path, 'utf-8')) as { entries?: Array<{ entity?: AffinityEntity }> };
    for (const row of data.entries ?? []) {
      const ent = row.entity;
      if (!ent?.id) continue;
      const primary = resolvePrimaryEmail(ent);
      const additional = resolveAdditionalEmails(primary, ent);
      if (additional.length > 0) {
        map.set(String(ent.id), additional);
      }
    }
  }
  return map;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const scratchDir = resolvePathfinderScratchDir({ mkdir: false });
  console.log(`Scratch dir: ${scratchDir}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);

  const affinityByInvestorId = loadAffinityAdditionalByInvestorId(scratchDir);
  console.log(`Affinity exports: ${affinityByInvestorId.size} investors with additional emails`);

  const affinityPersonRows = await prisma.affinityPerson.findMany({
    select: { affinityPersonId: true, primaryEmail: true, emailAddresses: true },
  });
  const personByInvestorId = new Map<string, string[]>();
  for (const row of affinityPersonRows) {
    const source: InvestorEmailSource = {
      primaryEmailAddress: row.primaryEmail,
      emailAddresses: row.emailAddresses,
    };
    const primary = resolvePrimaryEmail(source);
    const additional = resolveAdditionalEmails(primary, source);
    if (additional.length > 0) {
      personByInvestorId.set(row.affinityPersonId, additional);
    }
  }
  console.log(`AffinityPerson fallback: ${personByInvestorId.size} rows with additional emails`);

  const records = await prisma.investorOutreachRecord.findMany({
    select: { id: true, investorId: true, email: true, additionalEmails: true },
  });

  let wouldUpdate = 0;
  let fromAffinity = 0;
  let fromPerson = 0;
  const samples: Array<{ investorId: string; additional: string[] }> = [];

  for (const record of records) {
    const primary = normalizeEmailKey(record.email) || record.email.trim().toLowerCase();
    let additional = affinityByInvestorId.get(record.investorId) ?? personByInvestorId.get(record.investorId) ?? [];

    additional = resolveAdditionalEmails(primary, {
      primaryEmailAddress: primary,
      emailAddresses: additional,
    });

    if (additional.length === 0) continue;
    if (arraysEqual(additional, record.additionalEmails ?? [])) continue;

    wouldUpdate += 1;
    if (affinityByInvestorId.has(record.investorId)) fromAffinity += 1;
    else if (personByInvestorId.has(record.investorId)) fromPerson += 1;

    if (samples.length < 5) {
      samples.push({ investorId: record.investorId, additional });
    }

    if (apply) {
      await prisma.investorOutreachRecord.update({
        where: { id: record.id },
        data: { additionalEmails: additional },
      });
    }
  }

  console.log(`Records scanned: ${records.length}`);
  console.log(`Would update: ${wouldUpdate} (affinity=${fromAffinity}, person=${fromPerson})`);
  if (samples.length > 0) {
    console.log('Samples:', JSON.stringify(samples, null, 2));
  }
  if (!apply && wouldUpdate > 0) {
    console.log('Re-run with --apply to persist changes.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

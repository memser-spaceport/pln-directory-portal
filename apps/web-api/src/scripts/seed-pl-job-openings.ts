#!/usr/bin/env ts-node
/**
 * Dev-only seed: the eight Protocol Labs roles that live on the production board,
 * so the ATS "Import from job board" flow (LAB-2584) can be verified on dev.
 *
 * Rows are created only when the uid is missing; existing rows are left untouched,
 * so the script is safe to re-run. Never run this against production — the rows
 * already exist there.
 *
 * Usage: npx ts-node apps/web-api/src/scripts/seed-pl-job-openings.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { JobOpeningManagedBy, JobOpeningStatus, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PL_TEAM_UID = 'cldvnyxaf01ynu21k62uopjvg';

// From docs/HANDOFF-JOB-BOARD.md §5 (2026-09-11). Getro-linked rows keep their
// external apply link until the ATS claims them.
const PL_ROWS: { uid: string; roleTitle: string; sourceLink: string | null }[] = [
  { uid: 'pl-investor-relations-lead-plc', roleTitle: 'Investor Relations Lead', sourceLink: null },
  { uid: 'manual-pl-philanthropic-fundraising-lead', roleTitle: 'Philanthropic Fundraising Lead', sourceLink: null },
  { uid: 'manual-pl-senior-finance-leader-plcs', roleTitle: 'Senior Finance Leader', sourceLink: null },
  {
    uid: 'clneurotechpgm91537777x',
    roleTitle: 'Program Manager, Neurotech',
    sourceLink: 'https://jobs.polychain.capital/companies/protocol-labs/jobs/neurotech-program-manager',
  },
  {
    uid: 'manual-pl-start-up-operator-90020603',
    roleTitle: 'Start Up Operator',
    sourceLink: 'https://jobs.polychain.capital/companies/protocol-labs/jobs/90020603',
  },
  {
    uid: 'manual-pl-79560093',
    roleTitle: 'Platform Lead',
    sourceLink: 'https://jobs.polychain.capital/companies/protocol-labs/jobs/79560093',
  },
  {
    uid: 'cmon2cp90000489pm2syt03uz',
    roleTitle: 'Chief Marketing Officer, PL Infra',
    sourceLink: 'https://jobs.polychain.capital/companies/protocol-labs/jobs/cmo-pl-infra',
  },
  {
    uid: 'cmon2cpyk000589pm6wq8h5q2',
    roleTitle: 'Product Lead, PL Alignment Asset',
    sourceLink: 'https://jobs.polychain.capital/companies/protocol-labs/jobs/plaa-product-lead',
  },
];

async function main() {
  const team = await prisma.team.findUnique({ where: { uid: PL_TEAM_UID }, select: { name: true } });
  if (!team) {
    throw new Error(`Protocol Labs team ${PL_TEAM_UID} not found in this database — is this a dev database?`);
  }

  const now = new Date();
  let created = 0;
  let skipped = 0;

  for (const row of PL_ROWS) {
    const existing = await prisma.jobOpening.findUnique({ where: { uid: row.uid }, select: { uid: true } });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.jobOpening.create({
      data: {
        uid: row.uid,
        status: JobOpeningStatus.CONFIRMED,
        managedBy: JobOpeningManagedBy.MANUAL,
        companyName: team.name,
        signalType: 'manual',
        roleTitle: row.roleTitle,
        descriptionHtml: `<p>${row.roleTitle} at Protocol Labs.</p>`,
        detectionDate: now,
        sourceType: 'Manual',
        sourceLink: row.sourceLink,
        sourceDate: now,
        postedDate: now,
        lastSeenLive: now,
        canonicalKey: row.uid,
        dedupKey: row.sourceLink ?? row.uid,
        teamUid: PL_TEAM_UID,
        publishedAt: now,
      },
    });
    created++;
    console.log(`Created: ${row.roleTitle} (${row.uid})`);
  }

  console.log(`\nDone. created=${created} already-present=${skipped}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

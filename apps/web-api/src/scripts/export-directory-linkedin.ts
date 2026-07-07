#!/usr/bin/env ts-node
/**
 * Export LinkedIn-related person data from the directory DB to scratch JSON.
 *
 * Independent enrichment input for social-overlap Step 3 — no PathfinderPath queries.
 *
 * Manual run (manager; requires DATABASE_URL):
 *   cd pln-directory-portal
 *   npm run api:export-directory-linkedin
 *   # default output: seed_data/path_finder/_directory_linkedin_export.json
 *
 * Custom output:
 *   npx ts-node apps/web-api/src/scripts/export-directory-linkedin.ts --out /path/to/file.json
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  buildDirectoryLinkedinExportStats,
  cohortForInvestorListSlug,
  composeInvestorDisplayName,
  deriveLinkedinSlug,
  INVESTOR_LIST_SLUGS,
  normalizeMemberExperienceSpan,
  type DirectoryInvestorExport,
  type DirectoryLinkedinExport,
  type DirectoryMemberExport,
  type DirectoryTeamExport,
} from './directory-linkedin-export.util';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

function parseOutPath(): string {
  const scratchDir = resolvePathfinderScratchDir({ mkdir: true });
  const defaultOut = join(scratchDir, '_directory_linkedin_export.json');
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return defaultOut;
}

async function loadMembers(): Promise<DirectoryMemberExport[]> {
  const rows = await prisma.member.findMany({
    where: {
      memberApproval: { state: 'APPROVED' },
      deletedAt: null,
    },
    select: {
      uid: true,
      name: true,
      email: true,
      linkedinHandler: true,
      teamMemberRoles: {
        select: {
          role: true,
          team: { select: { uid: true, name: true } },
        },
      },
      experiences: {
        select: {
          company: true,
          title: true,
          startDate: true,
          endDate: true,
          isCurrent: true,
        },
      },
    },
    orderBy: { uid: 'asc' },
  });

  return rows.map((row) => ({
    uid: row.uid,
    name: row.name,
    email: row.email,
    linkedinHandler: row.linkedinHandler,
    linkedinSlug: deriveLinkedinSlug(row.linkedinHandler),
    teams: row.teamMemberRoles.map((tmr) => ({
      teamUid: tmr.team.uid,
      teamName: tmr.team.name,
      role: tmr.role,
    })),
    employment: row.experiences.map((exp) =>
      normalizeMemberExperienceSpan({
        company: exp.company,
        title: exp.title,
        startDate: exp.startDate,
        endDate: exp.endDate,
        isCurrent: exp.isCurrent,
      })
    ),
  }));
}

async function loadInvestors(): Promise<DirectoryInvestorExport[]> {
  const lists = await prisma.investorList.findMany({
    where: { slug: { in: [...INVESTOR_LIST_SLUGS] } },
    select: {
      slug: true,
      memberships: {
        select: {
          investorOutreachRecord: {
            select: {
              investorId: true,
              canonicalId: true,
              firstName: true,
              lastName: true,
              firm: true,
              linkedinUrl: true,
              email: true,
            },
          },
        },
      },
    },
  });

  const byInvestorId = new Map<string, DirectoryInvestorExport>();

  for (const list of lists) {
    const cohort = cohortForInvestorListSlug(list.slug);
    if (!cohort) continue;

    for (const membership of list.memberships) {
      const inv = membership.investorOutreachRecord;
      const existing = byInvestorId.get(inv.investorId);
      if (existing) {
        if (!existing.cohorts.includes(cohort)) {
          existing.cohorts.push(cohort);
          existing.cohorts.sort();
        }
        continue;
      }

      byInvestorId.set(inv.investorId, {
        investorId: inv.investorId,
        canonicalId: inv.canonicalId,
        name: composeInvestorDisplayName({
          firstName: inv.firstName,
          lastName: inv.lastName,
          firm: inv.firm,
          investorId: inv.investorId,
        }),
        firm: inv.firm,
        linkedinUrl: inv.linkedinUrl,
        email: inv.email,
        cohorts: [cohort],
        linkedinSlug: deriveLinkedinSlug(inv.linkedinUrl),
      });
    }
  }

  return [...byInvestorId.values()].sort((a, b) => a.investorId.localeCompare(b.investorId));
}

async function loadTeams(): Promise<DirectoryTeamExport[]> {
  const rows = await prisma.team.findMany({
    where: {
      accessLevel: { notIn: ['L0', 'Rejected'] },
    },
    select: {
      uid: true,
      name: true,
      linkedinHandler: true,
      website: true,
    },
    orderBy: { uid: 'asc' },
  });

  return rows.map((row) => ({
    teamUid: row.uid,
    name: row.name,
    linkedinHandler: row.linkedinHandler,
    website: row.website,
  }));
}

async function main(): Promise<void> {
  const outPath = parseOutPath();

  const [members, investors, teams] = await Promise.all([loadMembers(), loadInvestors(), loadTeams()]);

  const payload: DirectoryLinkedinExport = {
    exportedAt: new Date().toISOString(),
    source: 'portal-directory-export',
    members,
    investors,
    teams,
    stats: buildDirectoryLinkedinExportStats({ members, investors, teams }),
  };

  writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(payload.stats, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

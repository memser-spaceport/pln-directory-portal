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
} from '../scripts/directory-linkedin-export.util';

export async function loadDirectoryLinkedinExport(
  prisma: PrismaClient,
  exportedAt: string = new Date().toISOString(),
): Promise<DirectoryLinkedinExport> {
  const [members, investors, teams] = await Promise.all([
    loadMembers(prisma),
    loadInvestors(prisma),
    loadTeams(prisma),
  ]);

  return {
    exportedAt,
    source: 'portal-directory-export',
    members,
    investors,
    teams,
    stats: buildDirectoryLinkedinExportStats({ members, investors, teams }),
  };
}

async function loadMembers(prisma: PrismaClient): Promise<DirectoryMemberExport[]> {
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
      }),
    ),
  }));
}

async function loadInvestors(prisma: PrismaClient): Promise<DirectoryInvestorExport[]> {
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

async function loadTeams(prisma: PrismaClient): Promise<DirectoryTeamExport[]> {
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

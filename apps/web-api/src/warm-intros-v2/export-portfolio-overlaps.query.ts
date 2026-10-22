import { PrismaClient } from '@prisma/client';

export type PortfolioOverlapTeamExport = {
  teamUid: string;
  teamName: string | null;
  dealAmount: string | null;
  dealDate: string | null;
  dealStage: string | null;
  isLeadInvestor: boolean;
  attributionFund: string | null;
};

export type PortfolioOverlapInvestorExport = {
  investorId: string;
  email: string;
  additionalEmails: string[];
  firstName: string | null;
  lastName: string | null;
  displayName: string;
  linkedinUrl: string | null;
  firm: string | null;
  title: string | null;
  teams: PortfolioOverlapTeamExport[];
};

export type InvestorPortfolioOverlapsExport = {
  exportedAt: string;
  source: 'InvestorPortfolioOverlap';
  investors: PortfolioOverlapInvestorExport[];
  stats: { investorCount: number; overlapEdgeCount: number };
};

function displayName(firstName: string | null, lastName: string | null, email: string): string {
  const parts = [firstName, lastName].map((s) => (s ?? '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  const local = email.split('@')[0]?.trim();
  return local || email;
}

export async function loadInvestorPortfolioOverlaps(
  prisma: PrismaClient,
  exportedAt: string = new Date().toISOString(),
): Promise<InvestorPortfolioOverlapsExport> {
  const rows = await prisma.investorOutreachRecord.findMany({
    where: { portfolioOverlaps: { some: {} } },
    select: {
      investorId: true,
      email: true,
      additionalEmails: true,
      firstName: true,
      lastName: true,
      linkedinUrl: true,
      firm: true,
      title: true,
      portfolioOverlaps: {
        select: {
          teamUid: true,
          dealAmount: true,
          dealDate: true,
          dealStage: true,
          isLeadInvestor: true,
          attributionFund: true,
          team: { select: { name: true } },
        },
      },
    },
    orderBy: { investorId: 'asc' },
  });

  let overlapEdgeCount = 0;
  const investors: PortfolioOverlapInvestorExport[] = rows.map((row) => {
    overlapEdgeCount += row.portfolioOverlaps.length;
    return {
      investorId: row.investorId,
      email: row.email,
      additionalEmails: row.additionalEmails ?? [],
      firstName: row.firstName,
      lastName: row.lastName,
      displayName: displayName(row.firstName, row.lastName, row.email),
      linkedinUrl: row.linkedinUrl,
      firm: row.firm,
      title: row.title,
      teams: row.portfolioOverlaps.map((o) => ({
        teamUid: o.teamUid,
        teamName: o.team?.name ?? null,
        dealAmount: o.dealAmount != null ? String(o.dealAmount) : null,
        dealDate: o.dealDate ? o.dealDate.toISOString().slice(0, 10) : null,
        dealStage: o.dealStage,
        isLeadInvestor: o.isLeadInvestor,
        attributionFund: o.attributionFund,
      })),
    };
  });

  return {
    exportedAt,
    source: 'InvestorPortfolioOverlap',
    investors,
    stats: { investorCount: investors.length, overlapEdgeCount },
  };
}

#!/usr/bin/env ts-node
/**
 * Export InvestorOutreachRecord rows that have ≥1 InvestorPortfolioOverlap
 * for Warm Intros v2 MasterProfile co_investor tagging.
 *
 *   cd pln-directory-portal
 *   npm run api:export-investor-portfolio-overlaps
 *   # default: seed_data/path_finder/_investor_portfolio_overlaps.json
 *
 * Custom output:
 *   npx ts-node apps/web-api/src/scripts/export-investor-portfolio-overlaps.ts --out /path/to/file.json
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

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

function parseOutPath(): string {
  const scratchDir = resolvePathfinderScratchDir({ mkdir: true });
  const defaultOut = join(scratchDir, '_investor_portfolio_overlaps.json');
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return defaultOut;
}

function displayName(firstName: string | null, lastName: string | null, email: string): string {
  const parts = [firstName, lastName].map((s) => (s ?? '').trim()).filter(Boolean);
  if (parts.length) return parts.join(' ');
  const local = email.split('@')[0]?.trim();
  return local || email;
}

async function main(): Promise<void> {
  const outPath = parseOutPath();

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

  const payload: InvestorPortfolioOverlapsExport = {
    exportedAt: new Date().toISOString(),
    source: 'InvestorPortfolioOverlap',
    investors,
    stats: { investorCount: investors.length, overlapEdgeCount },
  };

  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Wrote ${investors.length} co-investor people (${overlapEdgeCount} overlap edges) → ${outPath}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

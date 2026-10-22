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
import { loadInvestorPortfolioOverlaps } from '../warm-intros-v2/export-portfolio-overlaps.query';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

function parseOutPath(): string {
  const scratchDir = resolvePathfinderScratchDir({ mkdir: true });
  const defaultOut = join(scratchDir, '_investor_portfolio_overlaps.json');
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return defaultOut;
}

function describeDatabaseUrl(url: string | undefined): string {
  if (!url?.trim()) return '(DATABASE_URL unset)';
  try {
    const u = new URL(url);
    const db = (u.pathname || '/').replace(/^\//, '') || '(none)';
    return `${u.hostname}:${u.port || '5432'}/${db}`;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

async function main(): Promise<void> {
  const outPath = parseOutPath();
  console.log(`Exporting InvestorPortfolioOverlap from ${describeDatabaseUrl(process.env.DATABASE_URL)}`);
  const payload = await loadInvestorPortfolioOverlaps(prisma);
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(
    `Wrote ${payload.stats.investorCount} co-investor people (${payload.stats.overlapEdgeCount} overlap edges) → ${outPath}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

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
import { loadDirectoryLinkedinExport } from '../warm-intros-v2/export-directory-linkedin.query';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

function parseOutPath(): string {
  const scratchDir = resolvePathfinderScratchDir({ mkdir: true });
  const defaultOut = join(scratchDir, '_directory_linkedin_export.json');
  const outIdx = process.argv.indexOf('--out');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return defaultOut;
}

async function main(): Promise<void> {
  const outPath = parseOutPath();
  const payload = await loadDirectoryLinkedinExport(prisma);
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

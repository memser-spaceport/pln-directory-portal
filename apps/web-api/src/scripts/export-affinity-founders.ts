#!/usr/bin/env ts-node
/**
 * Export Affinity founder list people (Portfolio Founders 155463 + Strategic Founders 281646)
 * from portal AffinityPerson sidecar tables into pathfinder scratch JSON
 * (same Affinity list-export shape as `_affinity_352080.json`).
 *
 *   cd pln-directory-portal
 *   npm run api:export-affinity-founders
 *
 * Writes:
 *   _affinity_155463.json
 *   _affinity_281646.json
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { loadAffinityFoundersExport } from '../warm-intros-v2/export-affinity-founders.query';
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

function parseScratchDir(): string {
  const outIdx = process.argv.indexOf('--scratch-dir');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return resolvePathfinderScratchDir({ mkdir: true });
}

async function main(): Promise<void> {
  const scratchDir = parseScratchDir();
  const exported = await loadAffinityFoundersExport(prisma);
  let total = 0;
  for (const list of exported.lists) {
    const outPath = join(scratchDir, list.file);
    writeFileSync(outPath, JSON.stringify(list.payload, null, 2), 'utf-8');
    console.log(`Wrote ${list.payload.entries.length} people → ${outPath}`);
    total += list.payload.entries.length;
  }
  console.log(`Done. Total founder list entries exported: ${total}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

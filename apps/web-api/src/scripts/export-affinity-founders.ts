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
import { resolvePathfinderScratchDir } from './pathfinder-scratch.util';

const prisma = new PrismaClient();

const FOUNDER_LISTS = [
  { listId: 155463, file: '_affinity_155463.json', name: 'Portfolio Founders' },
  { listId: 281646, file: '_affinity_281646.json', name: 'Strategic Founders' },
] as const;

function parseScratchDir(): string {
  const outIdx = process.argv.indexOf('--scratch-dir');
  if (outIdx >= 0 && process.argv[outIdx + 1]) return process.argv[outIdx + 1];
  return resolvePathfinderScratchDir({ mkdir: true });
}

async function exportList(
  scratchDir: string,
  listId: number,
  file: string,
  listName: string,
): Promise<number> {
  const memberships = await prisma.affinityListMembership.findMany({
    where: { affinityListId: listId, personUid: { not: null } },
    include: {
      person: true,
    },
  });

  const entries = memberships
    .filter((m) => m.person)
    .map((m) => {
      const p = m.person!;
      const fields: Array<{ id: string; name: string; value: { data: unknown } }> = [];
      if (p.currentOrganizationName) {
        fields.push({
          id: 'affinity-data-current-organization',
          name: 'Current Organization',
          value: { data: { name: p.currentOrganizationName } },
        });
      }
      if (p.currentJobTitle) {
        fields.push({
          id: 'affinity-data-current-job-title',
          name: 'Current Job Title',
          value: { data: p.currentJobTitle },
        });
      }
      if (p.linkedinUrl) {
        fields.push({
          id: 'affinity-data-linkedin-url',
          name: 'LinkedIn URL',
          value: { data: p.linkedinUrl },
        });
      }

      return {
        id: m.affinityListEntryId,
        listId,
        entity: {
          id: Number(p.affinityPersonId) || p.affinityPersonId,
          firstName: p.firstName,
          lastName: p.lastName,
          primaryEmailAddress: p.primaryEmail,
          emailAddresses: p.emailAddresses?.length
            ? p.emailAddresses
            : p.primaryEmail
              ? [p.primaryEmail]
              : [],
          type: 'person',
          fields,
        },
      };
    });

  const payload = {
    meta: { id: listId, name: listName, type: 'person', exportedFrom: 'AffinityPerson' },
    entries,
  };

  const outPath = join(scratchDir, file);
  writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');
  console.log(`Wrote ${entries.length} people → ${outPath}`);
  return entries.length;
}

async function main(): Promise<void> {
  const scratchDir = parseScratchDir();
  let total = 0;
  for (const list of FOUNDER_LISTS) {
    total += await exportList(scratchDir, list.listId, list.file, list.name);
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

#!/usr/bin/env ts-node
/**
 * Set per-investor emailTemplateVariables.sector_hook from a CSV for a Spotlight.
 *
 * CSV must include columns: email, sector_hook
 * (extra columns ignored; empty sector_hook clears the variable so the follow-up
 * template hides the "invested in …" sentence).
 *
 * Requires env: DATABASE_URL
 *
 * Examples (from pln-directory-portal/):
 *   npm run api:set-spotlight-sector-hooks -- --slug=YOUR_SLUG --csv=../spotlight-categories.csv
 *   npm run api:set-spotlight-sector-hooks -- --slug=YOUR_SLUG --csv=../spotlight-categories.csv --apply
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createReadStream } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function argValue(name: string): string | undefined {
  const eqPrefix = `${name}=`;
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith(eqPrefix)) return arg.slice(eqPrefix.length);
  }
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith('-')) {
    return process.argv[idx + 1];
  }
  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function asStringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') {
      result[key] = entry;
    }
  }
  return result;
}

/** Minimal CSV parser that supports quoted fields with commas. */
async function readSectorHookCsv(csvPath: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const rl = createInterface({ input: createReadStream(csvPath, { encoding: 'utf8' }), crlfDelay: Infinity });

  let headers: string[] | null = null;
  let emailIdx = -1;
  let sectorIdx = -1;
  let lineNo = 0;

  for await (const line of rl) {
    lineNo += 1;
    if (!line.trim()) continue;
    const cols = parseCsvLine(line);
    if (!headers) {
      headers = cols.map((h) => h.trim().toLowerCase());
      emailIdx = headers.indexOf('email');
      sectorIdx = headers.indexOf('sector_hook');
      if (emailIdx < 0 || sectorIdx < 0) {
        throw new Error(`CSV must include "email" and "sector_hook" columns (got: ${headers.join(', ')})`);
      }
      continue;
    }

    const email = (cols[emailIdx] || '').trim().toLowerCase();
    if (!email) {
      console.warn(`  skip line ${lineNo}: empty email`);
      continue;
    }
    const sectorHook = (cols[sectorIdx] || '').trim();
    map.set(email, sectorHook);
  }

  return map;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

async function main(): Promise<void> {
  const slug = argValue('--slug');
  const pitchUid = argValue('--pitch-uid');
  const csvArg = argValue('--csv') || '../spotlight-categories.csv';
  const apply = hasFlag('--apply');
  const csvPath = resolve(process.cwd(), csvArg);

  if (!slug && !pitchUid) {
    throw new Error('Pass --slug=<spotlight-slug> or --pitch-uid=<teamPitchUid>');
  }

  const sectorByEmail = await readSectorHookCsv(csvPath);
  console.log(`CSV: ${csvPath} (${sectorByEmail.size} emails)`);

  const pitch = await prisma.teamPitch.findFirst({
    where: slug ? { slug } : { uid: pitchUid },
    select: { uid: true, slug: true, title: true },
  });
  if (!pitch) {
    throw new Error(`Spotlight not found for ${slug ? `slug=${slug}` : `pitch-uid=${pitchUid}`}`);
  }

  const participants = await prisma.teamPitchParticipant.findMany({
    where: {
      teamPitchUid: pitch.uid,
      type: 'INVESTOR',
      member: { email: { not: null }, deletedAt: null },
    },
    select: {
      uid: true,
      emailTemplateVariables: true,
      member: { select: { email: true, name: true } },
    },
  });

  console.log(`Spotlight: ${pitch.title} (${pitch.slug})`);
  console.log(`Investor participants: ${participants.length}`);
  console.log(`Mode: ${apply ? 'APPLY' : 'dry-run'}`);

  let matched = 0;
  let wouldUpdate = 0;
  let cleared = 0;
  let set = 0;
  let unchanged = 0;
  let missingInCsv = 0;
  let updated = 0;

  for (const participant of participants) {
    const email = (participant.member.email || '').trim().toLowerCase();
    if (!email) continue;

    if (!sectorByEmail.has(email)) {
      missingInCsv += 1;
      continue;
    }
    matched += 1;

    const sectorHook = sectorByEmail.get(email) || '';
    const existing = asStringRecord(participant.emailTemplateVariables);
    const next = { ...existing };

    if (sectorHook) {
      next.sector_hook = sectorHook;
      set += 1;
    } else if ('sector_hook' in next) {
      delete next.sector_hook;
      cleared += 1;
    }

    const prevJson = JSON.stringify(existing);
    const nextJson = JSON.stringify(next);
    if (prevJson === nextJson) {
      unchanged += 1;
      continue;
    }

    wouldUpdate += 1;
    if (!apply) {
      console.log(`  would update ${email}: sector_hook=${sectorHook ? JSON.stringify(sectorHook) : '(cleared)'}`);
      continue;
    }

    const data =
      Object.keys(next).length === 0 ? { emailTemplateVariables: Prisma.DbNull } : { emailTemplateVariables: next };

    await prisma.teamPitchParticipant.update({
      where: { uid: participant.uid },
      data,
    });
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        matched,
        wouldUpdate,
        updated: apply ? updated : 0,
        set,
        cleared,
        unchanged,
        missingInCsv,
        csvEmails: sectorByEmail.size,
        participants: participants.length,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log('Dry-run only. Re-run with --apply to write changes.');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

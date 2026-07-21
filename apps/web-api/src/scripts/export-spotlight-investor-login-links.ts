#!/usr/bin/env ts-node
/**
 * Export Spotlight investor invite links with short-lived login tokens (CSV).
 *
 * Requires env (same as web-api):
 *   DATABASE_URL, AUTH_API_URL, AUTH_APP_CLIENT_ID, AUTH_APP_CLIENT_SECRET, WEB_UI_BASE_URL
 *
 * Examples (from pln-directory-portal/):
 *   npx ts-node apps/web-api/src/scripts/export-spotlight-investor-login-links.ts --slug=my-spotlight
 *   npx ts-node apps/web-api/src/scripts/export-spotlight-investor-login-links.ts --pitch-uid=<uid> --out=./investors.csv
 *   npx ts-node apps/web-api/src/scripts/export-spotlight-investor-login-links.ts --slug=my-spotlight --dry-run
 *   npx ts-node apps/web-api/src/scripts/export-spotlight-investor-login-links.ts --slug=my-spotlight --unique-email
 *
 * Tokens expire in 10 days from mint time. Treat the CSV as credentials.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';

const LOGIN_TOKEN_TTL_SECONDS = 864000; // 10 days
const DELAY_MS = 50;

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

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

async function getClientToken(authApiUrl: string, clientId: string, clientSecret: string): Promise<string> {
  const resp = await axios.post(`${authApiUrl}/auth/token`, {
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  });
  if (!resp.data?.access_token) {
    throw new Error('Auth service did not return access_token for client_credentials');
  }
  return resp.data.access_token as string;
}

async function issueLoginToken(authApiUrl: string, clientToken: string, email: string): Promise<string> {
  const resp = await axios.post(
    `${authApiUrl}/auth/login-token`,
    { email, expiresIn: LOGIN_TOKEN_TTL_SECONDS },
    { headers: { Authorization: `Bearer ${clientToken}` } }
  );
  if (!resp.data?.token) {
    throw new Error(`Auth service did not return login token for ${email}`);
  }
  return resp.data.token as string;
}

async function main(): Promise<void> {
  const slug = argValue('--slug');
  const pitchUid = argValue('--pitch-uid');
  const dryRun = hasFlag('--dry-run');
  const uniqueEmail = hasFlag('--unique-email');
  const outPath = argValue('--out') || join(process.cwd(), 'spotlight-investor-login-links.csv');

  if (!slug && !pitchUid) {
    throw new Error('Pass --slug=<spotlight-slug> or --pitch-uid=<teamPitchUid>');
  }

  const authApiUrl = requireEnv('AUTH_API_URL').replace(/\/$/, '');
  const clientId = requireEnv('AUTH_APP_CLIENT_ID');
  const clientSecret = requireEnv('AUTH_APP_CLIENT_SECRET');
  const webBase = requireEnv('WEB_UI_BASE_URL').replace(/\/$/, '');

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
      access: { not: 'RESTRICTED' },
      member: { email: { not: null }, deletedAt: null },
    },
    select: {
      uid: true,
      member: { select: { uid: true, name: true, email: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  type Row = { email: string; name: string; memberUid: string; participantUid: string };
  let rows: Row[] = participants
    .map((p) => ({
      email: (p.member.email || '').trim().toLowerCase(),
      name: p.member.name || '',
      memberUid: p.member.uid,
      participantUid: p.uid,
    }))
    .filter((r) => !!r.email);

  if (uniqueEmail) {
    const seen = new Set<string>();
    rows = rows.filter((r) => {
      if (seen.has(r.email)) return false;
      seen.add(r.email);
      return true;
    });
  }

  console.log(`Spotlight: ${pitch.title} (${pitch.slug})`);
  console.log(`Investors to export: ${rows.length}${uniqueEmail ? ' (unique email)' : ''}`);
  console.log(`Mode: ${dryRun ? 'dry-run (no tokens minted)' : 'mint login tokens'}`);
  console.log(`Output: ${outPath}`);

  let clientToken = '';
  if (!dryRun) {
    clientToken = await getClientToken(authApiUrl, clientId, clientSecret);
  }

  const csvLines = ['name,email,UID,url'];
  let ok = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    try {
      let url: string;
      if (dryRun) {
        url = `${webBase}/spotlight/${pitch.slug}?prefillEmail=${encodeURIComponent(row.email)}&loginToken=DRY_RUN`;
      } else {
        const loginToken = await issueLoginToken(authApiUrl, clientToken, row.email);
        url = `${webBase}/spotlight/${pitch.slug}?prefillEmail=${encodeURIComponent(
          row.email
        )}&loginToken=${encodeURIComponent(loginToken)}`;
        await sleep(DELAY_MS);
      }

      csvLines.push([row.name, row.email, row.memberUid, url].map(csvEscape).join(','));
      ok += 1;
      if ((i + 1) % 50 === 0 || i + 1 === rows.length) {
        console.log(`  progress ${i + 1}/${rows.length}`);
      }
    } catch (error: any) {
      failed += 1;
      const message = error?.response?.data ? JSON.stringify(error.response.data) : error?.message || String(error);
      console.error(`  FAIL ${row.email}: ${message}`);
    }
  }

  writeFileSync(outPath, csvLines.join('\n') + '\n', 'utf8');
  console.log(`Done. ok=${ok} failed=${failed} → ${outPath}`);
  console.log(`Note: login tokens expire in ${LOGIN_TOKEN_TTL_SECONDS / 86400} days from mint time.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

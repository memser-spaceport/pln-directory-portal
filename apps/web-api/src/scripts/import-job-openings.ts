#!/usr/bin/env ts-node
/**
 * Standalone script to import job openings from CSV
 * Usage: npx ts-node apps/web-api/src/scripts/import-job-openings.ts <csv-file-path>
 */

import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import { parse } from 'csv-parse/sync';
import { JobOpeningStatus, PrismaClient } from '@prisma/client';
import cuid from 'cuid';

const prisma = new PrismaClient();

interface CsvRow {
  'Company Name': string;
  'Signal Type': string;
  'Role Title': string;
  'Role Category': string;
  Department: string;
  Seniority: string;
  Summary: string;
  Location: string;
  'Detection Date': string;
  'Source Type': string;
  'Source Link': string;
  'Source Date': string;
  'Posted Date': string;
  'Last Seen Live': string;
  'Canonical Key': string;
  dw_company_id: string;
  'Last Updated': string;
  Notes: string;
}

function formatDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      return new Date(year, month - 1, day);
    }
    return null;
  } catch {
    return null;
  }
}

function mapSeniority(seniority: string): string | null {
  if (!seniority || seniority === 'Unknown') return null;
  return seniority;
}

function isTerminalStatus(status: JobOpeningStatus): boolean {
  switch (status) {
    case JobOpeningStatus.CONFIRMED:
    case JobOpeningStatus.ROUTED_TO_WS4:
    case JobOpeningStatus.CLOSED_DUPLICATE:
    case JobOpeningStatus.CLOSED_INCORRECT_SIGNAL:
    case JobOpeningStatus.CLOSED_NOT_HIRING_SIGNAL:
    case JobOpeningStatus.CLOSED_ROLE_FILLED:
      return true;
    default:
      return false;
  }
}

async function main() {
  const csvPath = process.argv[2];

  if (!csvPath) {
    console.error('Usage: npx ts-node apps/web-api/src/scripts/import-job-openings.ts <csv-file-path>');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`Reading CSV from: ${csvPath}`);

  const fileContent = fs.readFileSync(csvPath, 'utf-8');
  const records = parse(fileContent, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CsvRow[];

  console.log(`Found ${records.length} records in CSV`);

  let created = 0;
  let updated = 0;
  let failed = 0;
  const errors: string[] = [];

  // Pre-validate teams
  const teamUids = [...new Set(records.map((r) => r['dw_company_id']).filter(Boolean))];
  const validTeamUids = new Set<string>();

  if (teamUids.length > 0) {
    const teams = await prisma.team.findMany({
      where: { uid: { in: teamUids } },
      select: { uid: true },
    });
    for (const team of teams) {
      validTeamUids.add(team.uid);
    }
    console.log(`Validated ${validTeamUids.size}/${teamUids.length} teams from CSV`);
  }

  for (const row of records) {
    try {
      const teamUid = row['dw_company_id'] || null;
      const isValidTeam = teamUid && validTeamUids.has(teamUid);

      if (teamUid && !isValidTeam) {
        console.warn(`Team uid ${teamUid} not found for company "${row['Company Name']}"`);
      }

      const canonicalKey = row['Canonical Key'];
      if (!canonicalKey) {
        throw new Error('Missing canonicalKey');
      }

      const detectionDate = formatDate(row['Detection Date']) || new Date();
      const sourceDate = formatDate(row['Source Date']);
      const postedDate = formatDate(row['Posted Date']);
      const lastSeenLive = formatDate(row['Last Seen Live']);
      const updatedAt = formatDate(row['Last Updated']) || new Date();

      const data = {
        status: JobOpeningStatus.NEW,
        companyName: row['Company Name'] || '',
        signalType: row['Signal Type'] || 'Open Role',
        roleTitle: row['Role Title'] || '',
        roleCategory: row['Role Category'] || null,
        department: row.Department || null,
        seniority: mapSeniority(row.Seniority),
        summary: row.Summary || null,
        location: row.Location || null,
        workMode: null,
        detectionDate,
        sourceType: row['Source Type'] || null,
        sourceLink: row['Source Link'] || null,
        sourceDate,
        postedDate,
        lastSeenLive,
        updatedAt,
        canonicalKey,
        teamUid: isValidTeam ? teamUid : null,
        notes: row.Notes || null,
      };

      const existing = await prisma.jobOpening.findUnique({
        where: { canonicalKey: data.canonicalKey },
      });

      if (existing) {
        const nextStatus = isTerminalStatus(existing.status) ? existing.status : data.status;
        await prisma.jobOpening.update({
          where: { id: existing.id },
          data: {
            status: nextStatus,
            companyName: data.companyName,
            signalType: data.signalType,
            roleTitle: data.roleTitle,
            roleCategory: data.roleCategory,
            department: data.department,
            seniority: data.seniority,
            summary: data.summary,
            location: data.location,
            workMode: data.workMode,
            detectionDate: data.detectionDate,
            sourceType: data.sourceType,
            sourceLink: data.sourceLink,
            sourceDate: data.sourceDate,
            postedDate: data.postedDate,
            lastSeenLive: data.lastSeenLive,
            teamUid: data.teamUid,
            notes: data.notes,
            updatedAt: data.updatedAt,
          },
        });
        updated++;
        console.log(`Updated: ${data.roleTitle} at ${data.companyName}`);
      } else {
        await prisma.jobOpening.create({
          data: {
            ...data,
            uid: cuid(),
            updatedAt: data.updatedAt,
          },
        });
        created++;
        console.log(`Created: ${data.roleTitle} at ${data.companyName}`);
      }
    } catch (error) {
      failed++;
      const message = `Failed to process ${row['Role Title']} at ${row['Company Name']}: ${error.message}`;
      errors.push(message);
      console.error(message);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Total: ${records.length}`);
  console.log(`Created: ${created}`);
  console.log(`Updated: ${updated}`);
  console.log(`Failed: ${failed}`);

  if (errors.length > 0) {
    console.log('\n--- Errors ---');
    errors.forEach((err) => console.log(err));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

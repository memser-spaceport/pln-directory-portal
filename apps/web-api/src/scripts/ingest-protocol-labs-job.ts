#!/usr/bin/env ts-node
/**
 * One-off ingest for a single Protocol Labs job opening via the authenticated
 * service-to-service endpoint: POST /v1/service/job-openings/ingest
 *
 * Job: "Start-up Operator" @ Protocol Labs (via PL Job Board / Polychain jobs)
 * Source: https://jobs.polychain.capital/companies/pl-job-board/jobs/90020603-start-up-operator
 *
 * This does NOT touch the database directly - it calls the running web-api
 * instance over HTTP, the same way an external service would.
 *
 * Requires env:
 *   WEB_API_BASE_URL         Base URL of the web-api deployment, e.g. https://api.example.com
 *   INTERNAL_SERVICE_SECRET  Shared secret configured on the target web-api instance
 *
 * Usage (from pln-directory-portal/):
 *   npx ts-node apps/web-api/src/scripts/ingest-protocol-labs-job.ts
 *   npx ts-node apps/web-api/src/scripts/ingest-protocol-labs-job.ts --dry-run
 */
import * as dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
}

const SOURCE_LINK = 'https://jobs.polychain.capital/companies/pl-job-board/jobs/90020603-start-up-operator';

// NOTE: role details beyond what's in the URL (location, seniority, department,
// full description) were not verified against the live listing - fill these in
// from the posting before running against a production instance if greater
// accuracy is needed.
const job = {
  status: 'NEW',
  companyName: 'Protocol Labs',
  signalType: 'Open Role',
  roleTitle: 'Start-up Operator',
  sourceType: 'Job Board',
  sourceLink: SOURCE_LINK,
  detectionDate: new Date().toISOString(),
  canonicalKey: 'protocol labs||start-up operator',
  // Prefer the source link for dedup, matching src/scripts/import-job-openings.ts convention.
  dedupKey: SOURCE_LINK,
  notes: 'Sourced via Polychain Capital jobs board (PL Job Board company listing).',
};

async function main() {
  const baseUrl = requireEnv('WEB_API_BASE_URL').replace(/\/$/, '');
  const serviceSecret = requireEnv('INTERNAL_SERVICE_SECRET');
  const dryRun = hasFlag('--dry-run');

  const payload = {
    jobs: [job],
    runId: `manual-protocol-labs-${Date.now()}`,
    source: 'manual-script',
  };

  if (dryRun) {
    console.log('[dry-run] Would POST to', `${baseUrl}/v1/service/job-openings/ingest`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  const response = await axios.post(`${baseUrl}/v1/service/job-openings/ingest`, payload, {
    headers: {
      Authorization: `Bearer ${serviceSecret}`,
      'Content-Type': 'application/json',
    },
  });

  console.log('Ingest response:', JSON.stringify(response.data, null, 2));
}

main().catch((err) => {
  if (axios.isAxiosError(err)) {
    console.error('Ingest request failed:', err.response?.status, err.response?.data ?? err.message);
  } else {
    console.error(err);
  }
  process.exit(1);
});

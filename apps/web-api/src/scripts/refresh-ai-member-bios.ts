/**
 * Refreshes AI-generated member bios (the ones carrying the Husky disclaimer)
 * with correct gender handling. Past generations defaulted to guessed pronouns
 * ("She" for many members); the rewritten prompt only genders a bio when the
 * gender is verified, so a refresh regenerates every AI bio safely.
 *
 * The core logic lives in src/husky/member-bio-refresh.util.ts (shared with
 * the admin endpoint POST /v1/admin/members/ai-bios/refresh). Pronoun
 * resolution is cost-laddered per member:
 *   1. Free: explicit pronoun markers in stored profile data + CRM gender
 *      (AffinityPerson via MasterProfile/email). If this resolves, NO paid
 *      scrape is made.
 *   2. ScrapingDog X profile (cheap) — pronouns are often in the X bio.
 *   3. ScrapingDog LinkedIn person profile (expensive, 50-100 credits) — also
 *      yields experience/about that enriches the regenerated bio.
 * Whatever was scraped is passed to the generator as verified context, so a
 * paid call improves the bio as a side effect.
 *
 *   yarn api:refresh-ai-member-bios                       # dry-run (default): report only, zero paid calls
 *   yarn api:refresh-ai-member-bios -- --apply            # regenerate & save
 *   yarn api:refresh-ai-member-bios -- --apply --limit 20
 *   yarn api:refresh-ai-member-bios -- --apply --email a@b.c --email c@d.e
 *   yarn api:refresh-ai-member-bios -- --apply --no-scrape   # never call ScrapingDog
 */
import { PrismaClient } from '@prisma/client';
import { runMemberBioRefresh } from '../husky/member-bio-refresh.util';
import { MemberScrapingDogService } from '../husky/member-scrapingdog.service';

const prisma = new PrismaClient();
const scrapingDog = new MemberScrapingDogService();

interface CliOptions {
  apply: boolean;
  limit: number | null;
  emails: string[];
  noScrape: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { apply: false, limit: null, emails: [], noScrape: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--no-scrape') options.noScrape = true;
    else if (arg === '--limit') options.limit = parseInt(argv[++i], 10);
    else if (arg === '--email') options.emails.push(argv[++i]);
  }
  if (options.limit !== null && (!Number.isFinite(options.limit) || options.limit <= 0)) {
    throw new Error('--limit must be a positive integer');
  }
  return options;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  console.log(`Mode: ${options.apply ? 'APPLY' : 'dry-run'}${options.noScrape ? ' (scraping disabled)' : ''}`);

  const { totalAiGeneratedBios, processed, stats } = await runMemberBioRefresh(
    prisma,
    scrapingDog,
    options,
    console.log
  );

  console.log('\nSummary:');
  console.log(`  total members with 'Bio is AI generated': ${totalAiGeneratedBios}`);
  console.log(`  processed this run: ${processed}`);
  console.log(`  pronouns from free signals: ${stats.freeResolved}`);
  console.log(`  pronouns from scraping:     ${stats.scrapeResolved}`);
  console.log(`  pronouns unknown (they/them fallback): ${stats.unknown}`);
  console.log(`  ScrapingDog calls: ${stats.xCalls} X, ${stats.linkedinCalls} LinkedIn person`);
  if (options.apply) {
    console.log(`  bios updated: ${stats.updated}`);
    console.log(`  empty generations skipped: ${stats.emptyGeneration}`);
  }
  console.log(`  errors: ${stats.errors}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

import { PrismaClient } from '@prisma/client';
import {
  MemberScrapingDogService,
  ScrapingDogMemberXProfile,
  ScrapingDogPersonProfile,
} from './member-scrapingdog.service';
import {
  generateMemberBioText,
  resolveMemberPronouns,
  scanTextForExplicitPronouns,
  PronounResolution,
} from './member-bio.util';
import { HUSKY_BIO_DISCLAIMER } from '../utils/ai-prompts';

/**
 * Core of the AI-bio refresh driven by the admin endpoint
 * (MemberBioRefreshService → POST /v1/admin/members/ai-bios/refresh).
 * Takes a plain PrismaClient so a standalone script could also drive it.
 */

// Matches the visible text of HUSKY_BIO_DISCLAIMER without depending on its
// exact HTML wrapping, so older disclaimer variants are still caught.
export const AI_BIO_MARKER = 'Bio is AI generated';

export interface BioRefreshOptions {
  /** false = dry-run: report only, zero paid calls. */
  apply: boolean;
  limit?: number | null;
  emails?: string[];
  noScrape?: boolean;
}

export interface BioRefreshStats {
  freeResolved: number;
  scrapeResolved: number;
  unknown: number;
  updated: number;
  emptyGeneration: number;
  errors: number;
  xCalls: number;
  linkedinCalls: number;
}

export interface BioRefreshMemberResult {
  uid: string;
  name: string;
  email: string | null;
  pronouns: string | null;
  pronounSource: string | null;
  outcome: 'updated' | 'reported' | 'would-scrape' | 'empty-generation' | 'error';
  detail?: string;
}

export interface BioRefreshRunResult {
  /** Total members whose bio carries the AI marker, ignoring limit/email filters. */
  totalAiGeneratedBios: number;
  processed: number;
  stats: BioRefreshStats;
  members: BioRefreshMemberResult[];
}

export function countAiGeneratedBios(prisma: PrismaClient): Promise<number> {
  return prisma.member.count({ where: { bio: { contains: AI_BIO_MARKER } } });
}

function formatTwitterContext(profile: ScrapingDogMemberXProfile): string {
  const lines = [`- X profile (@${profile.username || 'unknown'}):`];
  if (profile.name) lines.push(`  - Display name: ${profile.name}`);
  if (profile.description) lines.push(`  - Bio: ${profile.description}`);
  return lines.join('\n');
}

function formatPersonContext(profile: ScrapingDogPersonProfile): string {
  const lines = [`- LinkedIn profile (${profile.fullName || profile.publicIdentifier || 'unknown'}):`];
  if (profile.headline) lines.push(`  - Headline: ${profile.headline}`);
  if (profile.location) lines.push(`  - Location: ${profile.location}`);
  if (profile.about) lines.push(`  - About: ${profile.about}`);
  if (profile.experiences.length > 0) {
    lines.push('  - Experience:');
    for (const exp of profile.experiences) {
      const parts = [exp.title, exp.company ? `at ${exp.company}` : null, exp.duration ? `(${exp.duration})` : null]
        .filter(Boolean)
        .join(' ');
      lines.push(`    - ${parts}${exp.summary ? ` — ${exp.summary}` : ''}`);
    }
  }
  if (profile.education.length > 0) {
    lines.push(`  - Education: ${profile.education.join('; ')}`);
  }
  return lines.join('\n');
}

interface ScrapeOutcome {
  pronouns: PronounResolution | null;
  scrapedContext: string | null;
  xCalls: number;
  linkedinCalls: number;
}

/**
 * Paid ladder, cheapest first. Stops scraping as soon as pronouns are found;
 * everything fetched along the way is kept as bio context.
 */
async function scrapeForPronouns(
  scrapingDog: MemberScrapingDogService,
  member: { twitterHandler: string | null; linkedinHandler: string | null }
): Promise<ScrapeOutcome> {
  const contextParts: string[] = [];
  let pronouns: PronounResolution | null = null;
  let xCalls = 0;
  let linkedinCalls = 0;

  if (member.twitterHandler) {
    xCalls++;
    const result = await scrapingDog.fetchXProfile(member.twitterHandler);
    if (result.kind === 'ok') {
      contextParts.push(formatTwitterContext(result.profile));
      const found = scanTextForExplicitPronouns([result.profile.name, result.profile.description].join('\n'));
      if (found) pronouns = { pronouns: found, source: 'pronouns listed on their X profile' };
    }
  }

  if (!pronouns && member.linkedinHandler) {
    linkedinCalls++;
    const result = await scrapingDog.fetchPersonProfile(member.linkedinHandler);
    if (result.kind === 'ok') {
      contextParts.push(formatPersonContext(result.profile));
      const found = scanTextForExplicitPronouns(
        [result.profile.fullName, result.profile.headline, result.profile.about].join('\n')
      );
      if (found) pronouns = { pronouns: found, source: 'pronouns listed on their LinkedIn profile' };
    }
  }

  return { pronouns, scrapedContext: contextParts.length > 0 ? contextParts.join('\n') : null, xCalls, linkedinCalls };
}

export async function runMemberBioRefresh(
  prisma: PrismaClient,
  scrapingDog: MemberScrapingDogService,
  options: BioRefreshOptions,
  log: (line: string) => void = () => undefined
): Promise<BioRefreshRunResult> {
  const totalAiGeneratedBios = await countAiGeneratedBios(prisma);

  const members = await prisma.member.findMany({
    where: {
      bio: { contains: AI_BIO_MARKER },
      ...(options.emails && options.emails.length > 0 ? { email: { in: options.emails } } : {}),
    },
    include: {
      skills: true,
      teamMemberRoles: { include: { team: true } },
      projectContributions: { include: { project: true } },
      experiences: true,
      location: true,
    },
    orderBy: { createdAt: 'asc' },
    ...(options.limit ? { take: options.limit } : {}),
  });

  log(
    `Total members with an AI-generated bio: ${totalAiGeneratedBios}; processing ${members.length}${
      options.limit ? ` (limit ${options.limit})` : ''
    }`
  );

  const scrapeConfigured = scrapingDog.isConfigured();
  if (!options.noScrape && !scrapeConfigured) {
    log('SCRAPINGDOG_API_KEY not set — scraping will be skipped');
  }

  const stats: BioRefreshStats = {
    freeResolved: 0,
    scrapeResolved: 0,
    unknown: 0,
    updated: 0,
    emptyGeneration: 0,
    errors: 0,
    xCalls: 0,
    linkedinCalls: 0,
  };
  const results: BioRefreshMemberResult[] = [];

  for (const [index, member] of members.entries()) {
    const label = `[${index + 1}/${members.length}] ${member.name} <${member.email}>`;
    const base = { uid: member.uid, name: member.name, email: member.email };
    try {
      let pronouns = await resolveMemberPronouns(prisma, member);
      let scrapedContext: string | null = null;

      if (pronouns) {
        stats.freeResolved++;
      } else if (options.noScrape || !scrapeConfigured) {
        stats.unknown++;
      } else if (!options.apply) {
        // Dry-run makes no paid calls; just report what would happen.
        const targets = [member.twitterHandler ? 'X' : null, member.linkedinHandler ? 'LinkedIn' : null]
          .filter(Boolean)
          .join(' then ');
        const detail = `would scrape ${targets || 'nothing (no handles)'}`;
        log(`${label}: pronouns unknown — ${detail}`);
        stats.unknown++;
        results.push({ ...base, pronouns: null, pronounSource: null, outcome: 'would-scrape', detail });
        continue;
      } else {
        const outcome = await scrapeForPronouns(scrapingDog, member);
        stats.xCalls += outcome.xCalls;
        stats.linkedinCalls += outcome.linkedinCalls;
        pronouns = outcome.pronouns;
        scrapedContext = outcome.scrapedContext;
        if (pronouns) stats.scrapeResolved++;
        else stats.unknown++;
      }

      const pronounNote = pronouns ? `${pronouns.pronouns} (${pronouns.source})` : 'unknown → first name, no pronouns';
      const pronounFields = {
        pronouns: pronouns?.pronouns ?? null,
        pronounSource: pronouns?.source ?? null,
      };
      if (!options.apply) {
        log(`${label}: ${pronounNote}`);
        results.push({ ...base, ...pronounFields, outcome: 'reported' });
        continue;
      }

      const bio = await generateMemberBioText(member, { pronouns, scrapedContext });
      if (!bio || bio.trim().length === 0) {
        log(`${label}: model returned an empty bio — keeping the existing one`);
        stats.emptyGeneration++;
        results.push({ ...base, ...pronounFields, outcome: 'empty-generation' });
        continue;
      }

      await prisma.member.update({
        where: { uid: member.uid },
        data: { bio: `${bio}${HUSKY_BIO_DISCLAIMER}` },
      });
      stats.updated++;
      log(`${label}: updated (${pronounNote})`);
      results.push({ ...base, ...pronounFields, outcome: 'updated' });
    } catch (error) {
      stats.errors++;
      const detail = (error as Error).message;
      log(`${label}: FAILED — ${detail}`);
      results.push({ ...base, pronouns: null, pronounSource: null, outcome: 'error', detail });
    }
  }

  return { totalAiGeneratedBios, processed: members.length, stats, members: results };
}

import { generateText } from 'ai';
import * as countries from 'i18n-iso-countries';
import { PrismaClient } from '@prisma/client';
import { HUSKY_AUTO_BIO_SYSTEM_PROMPT, HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT } from '../utils/ai-prompts';
import { AiProviderService, AiProviderType } from '../shared/ai-provider.service';

import('i18n-iso-countries/langs/en.json').then((en) => {
  countries.registerLocale(en);
});

/**
 * Provider selection for ALL Husky generation calls (bio, skills, recommendation reasons)
 * Set HUSKY_GENERATION_AI_PROVIDER=gemini|anthropic|openai to switch.
 */
export const HUSKY_GENERATION_PROVIDER_ENV_VAR = 'HUSKY_GENERATION_AI_PROVIDER';
export const HUSKY_GENERATION_FALLBACK_PROVIDER: AiProviderType = 'gemini';

// AiProviderService has no constructor dependencies; a lazy module-level
// instance lets this plain util (and standalone scripts) share the exact
// provider-resolution logic Nest services get via DI.
let sharedAiProvider: AiProviderService | null = null;
export function getHuskyAiProvider(): AiProviderService {
  if (!sharedAiProvider) sharedAiProvider = new AiProviderService();
  return sharedAiProvider;
}

export type MemberPronouns = 'he/him' | 'she/her' | 'they/them';

export interface PronounResolution {
  pronouns: MemberPronouns;
  source: string;
}

export interface MemberBioOptions {
  pronouns?: PronounResolution | null;
  /** Pre-formatted, identity-verified scraped data (LinkedIn person / X profile) to enrich the bio. */
  scrapedContext?: string | null;
}

const PRONOUN_PATTERNS: Array<{ pronouns: MemberPronouns; re: RegExp }> = [
  { pronouns: 'she/her', re: /\bshe\s*\/\s*(her|hers)\b|\bpronouns?\s*[:\-]\s*"?she\b/i },
  { pronouns: 'he/him', re: /\bhe\s*\/\s*(him|his)\b|\bpronouns?\s*[:\-]\s*"?he\b/i },
  { pronouns: 'they/them', re: /\bthey\s*\/\s*(them|theirs?)\b|\bpronouns?\s*[:\-]\s*"?they\b/i },
];

/**
 * Detects an explicit, self-declared pronoun marker (e.g. "(she/her)") in free
 * text. Deliberately narrow: prose that merely *uses* he/she is not a
 * declaration, so it must not match. When several markers appear (e.g.
 * "she/they"), the earliest one in the text wins.
 */
export function scanTextForExplicitPronouns(text: string | null | undefined): MemberPronouns | null {
  if (!text) return null;
  let best: { pronouns: MemberPronouns; index: number } | null = null;
  for (const { pronouns, re } of PRONOUN_PATTERNS) {
    const match = re.exec(text);
    if (match && (!best || match.index < best.index)) {
      best = { pronouns, index: match.index };
    }
  }
  return best?.pronouns ?? null;
}

/** Maps a CRM gender value (e.g. AffinityPerson.gender) to pronouns; null when the value isn't conclusive. */
export function mapGenderToPronouns(gender: string | null | undefined): MemberPronouns | null {
  if (!gender) return null;
  const g = gender.trim().toLowerCase();
  if (g === 'female' || g === 'woman' || g === 'f') return 'she/her';
  if (g === 'male' || g === 'man' || g === 'm') return 'he/him';
  if (g === 'non-binary' || g === 'nonbinary' || g === 'non binary' || g === 'genderqueer') return 'they/them';
  return null;
}

/**
 * Resolves a member's pronouns from data we already have — no paid calls.
 * Ladder: explicit pronoun markers in stored profile JSON/text (self-declared,
 * most authoritative) → CRM gender from AffinityPerson (linked via
 * MasterProfile or matched by email).
 */
export async function resolveMemberPronouns(prisma: PrismaClient, member: any): Promise<PronounResolution | null> {
  const localTexts: Array<{ source: string; text: string | null }> = [
    { source: 'linkedin details on file', text: member.linkedInDetails ? JSON.stringify(member.linkedInDetails) : null },
    { source: 'profile details on file', text: member.moreDetails ?? null },
  ];
  for (const { source, text } of localTexts) {
    const pronouns = scanTextForExplicitPronouns(text);
    if (pronouns) return { pronouns, source };
  }

  const affinityGender = await findAffinityGenderForMember(prisma, member);
  if (affinityGender) {
    const pronouns = mapGenderToPronouns(affinityGender);
    if (pronouns) return { pronouns, source: 'CRM gender record' };
  }

  return null;
}

async function findAffinityGenderForMember(prisma: PrismaClient, member: any): Promise<string | null> {
  const masterProfile = await prisma.masterProfile.findFirst({
    where: { memberUid: member.uid, affinityPersonId: { not: null } },
    select: { affinityPersonId: true },
  });
  if (masterProfile?.affinityPersonId) {
    const person = await prisma.affinityPerson.findUnique({
      where: { affinityPersonId: masterProfile.affinityPersonId },
      select: { gender: true },
    });
    if (person?.gender) return person.gender;
  }

  if (member.email) {
    const person = await prisma.affinityPerson.findFirst({
      where: {
        OR: [
          { primaryEmail: { equals: member.email, mode: 'insensitive' } },
          { emailAddresses: { has: member.email } },
          { emailAddresses: { has: member.email.toLowerCase() } },
        ],
        gender: { not: null },
      },
      select: { gender: true },
    });
    if (person?.gender) return person.gender;
  }

  return null;
}

export function buildMemberBioPrompt(member: any, options: MemberBioOptions = {}): string {
  const pronounLine = options.pronouns
    ? `${options.pronouns.pronouns} (verified via ${options.pronouns.source})`
    : 'unknown — do NOT guess; avoid third-person pronouns entirely and refer to the member by their first name';

  return `
      Profile:
      - Name: ${member.name}
      - Known Pronouns: ${pronounLine}
      - Email: ${member.email || ''}
      - GitHub: ${member.githubHandler || ''}
      - LinkedIn: ${member.linkedinHandler || ''}
      - Twitter: ${member.twitterHandler || ''}
      - Discord: ${member.discordHandler || ''}
      - Telegram: ${member.telegramHandler || ''}
      - Location: ${member.location ? `${member.location.city || ''}, ${member.location.country || ''}` : ''}
      - Skills: ${member.skills?.map((skill) => skill.title).join(', ') || ''}
      - Team Roles: ${member.teamMemberRoles
        .map((role) => `${role.role} at ${role.team.name}${role.teamLead ? ' (Team Lead)' : ''}`)
        .join(', ')}
      - Project Contributions: ${member.projectContributions
        .map(
          (contribution) =>
            `${contribution.role || 'Contributor'} for ${contribution.project?.name || 'Unknown Project'}`
        )
        .join(', ')}
      - Professional Experience: ${member.experiences
        .map(
          (exp) =>
            `${exp.title} at ${exp.company}${exp.location ? ` in ${exp.location}` : ''} (${exp.startDate} - ${
              exp.endDate || 'Present'
            })`
        )
        .join('\n')}
      - Additional Details: ${member.moreDetails || ''}
      - LinkedIn Details: ${member.linkedInDetails ? JSON.stringify(member.linkedInDetails) : ''}
      ${
        options.scrapedContext
          ? `\nVerified data fetched directly from the member's own social profiles (authoritative — the identity is guaranteed because it was retrieved via the handles listed above):\n${options.scrapedContext}`
          : ''
      }
    `;
}

export function hasEnoughIdentifyingInfo(member: any): boolean {
  const hasUniqueName = member.name && member.name.trim().length > 0;
  const hasSocialMedia = member.githubHandler || member.linkedinHandler || member.twitterHandler;
  const hasTeamInfo = member.teamMemberRoles && member.teamMemberRoles.length > 0;
  const hasLocation = member.location && (member.location.city || member.location.country);
  const hasExperience = member.experiences && member.experiences.length > 0;

  // Need at least 3 pieces of identifying information to safely use web search
  const identifyingFactors = [hasUniqueName, hasSocialMedia, hasTeamInfo, hasLocation, hasExperience].filter(Boolean);

  return identifyingFactors.length >= 3;
}

/**
 * Approximate user-location hint for the web-search tool, derived from the
 * member's city/country (country converted to an Alpha-2 code). Only OpenAI's
 * web_search_preview consumes it; other providers ignore the option.
 */
export function buildUserLocation(member: any): { type: 'approximate'; city?: string; country?: string } | undefined {
  let countryCode: string | undefined = undefined;
  if (member.location?.country) {
    // Check if it's already a 2-letter Alpha-2 code
    if (member.location.country.length === 2 && countries.isValid(member.location.country)) {
      countryCode = member.location.country.toUpperCase();
    } else {
      // Try to convert country name to Alpha-2 code
      countryCode = countries.getAlpha2Code(member.location.country, 'en');
    }
  }

  if (member.location?.city && countryCode) {
    return { type: 'approximate', city: member.location.city, country: countryCode };
  }
  if (member.location?.city) {
    return { type: 'approximate', city: member.location.city };
  }
  return undefined;
}

/**
 * Core bio generation shared by the on-demand endpoint and the bulk refresh
 * script. Returns the raw generated HTML (may be empty when the model decides
 * there is not enough data) — callers append the AI disclaimer.
 */
export async function generateMemberBioText(member: any, options: MemberBioOptions = {}): Promise<string> {
  const aiProvider = getHuskyAiProvider();
  const useWebSearch = hasEnoughIdentifyingInfo(member);

  const generateTextOptions: any = {
    model: aiProvider.getResponsesModel(HUSKY_GENERATION_PROVIDER_ENV_VAR, {
      // Gemini grounds at the model level; only enable it on the web-search
      // path so the database-only prompt stays genuinely offline.
      useSearchGrounding: useWebSearch,
      fallbackProvider: HUSKY_GENERATION_FALLBACK_PROVIDER,
    }),
    prompt: buildMemberBioPrompt(member, options),
    temperature: 0.7,
  };

  if (useWebSearch) {
    // Use web search with strict verification
    generateTextOptions.system = HUSKY_AUTO_BIO_SYSTEM_PROMPT;
    const tools = aiProvider.getWebSearchTool(HUSKY_GENERATION_PROVIDER_ENV_VAR, {
      searchContextSize: 'high',
      userLocation: buildUserLocation(member),
      fallbackProvider: HUSKY_GENERATION_FALLBACK_PROVIDER,
    });
    if (Object.keys(tools).length > 0) {
      generateTextOptions.tools = tools;
    }
    // Forcing the tool call is an OpenAI Responses-API concept; the
    // web_search_preview key is only present on the OpenAI tool bundle.
    if (tools.web_search_preview) {
      generateTextOptions.toolChoice = { type: 'tool', toolName: 'web_search_preview' };
    }
  } else {
    // Use database-only prompt without web search
    generateTextOptions.system = HUSKY_AUTO_BIO_DATABASE_ONLY_PROMPT;
  }

  const { text: bio } = await generateText(generateTextOptions);
  return bio;
}

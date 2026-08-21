import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import {
  HUSKY_GENERATION_FALLBACK_PROVIDER,
  HUSKY_GENERATION_PROVIDER_ENV_VAR,
  buildUserLocation,
  hasEnoughIdentifyingInfo,
} from '../husky/member-bio.util';
import { normalizeBlueskyHandler } from '../teams/team-handle-normalizer';
import { normalizeTelegramHandle, normalizeTwitterHandle } from '../team-enrichment/shared';

/**
 * Member social handle fields this service can search for. `discordHandler` is
 * deliberately excluded — Discord has no crawlable public profile page, so a web
 * search is very unlikely to find (or safely verify) one.
 */
export const MEMBER_SOCIAL_HANDLE_FIELDS = [
  'linkedinHandler',
  'twitterHandler',
  'githubHandler',
  'telegramHandler',
  'blueskyHandler',
] as const;

export type MemberSocialHandleField = typeof MEMBER_SOCIAL_HANDLE_FIELDS[number];

export type MemberSocialHandleLookupResult = Partial<Record<MemberSocialHandleField, string>>;

const FIELD_DESCRIPTIONS: Record<MemberSocialHandleField, string> = {
  linkedinHandler: 'LinkedIn profile slug — the part of the URL after "linkedin.com/in/", without the "in/" prefix',
  twitterHandler: 'Twitter/X handle without the leading @',
  githubHandler: 'GitHub username without the leading @',
  telegramHandler: 'Telegram handle without the leading @',
  blueskyHandler: 'Bluesky (bsky.app) handle without the leading @ (e.g. "jane.bsky.social")',
};

const MEMBER_SOCIAL_HANDLES_SYSTEM_PROMPT = `
You are verifying a real person's identity to find their public social media / professional profile handles.

CRITICAL REQUIREMENTS:
1. Only return a handle for a field if you are HIGHLY confident it belongs to the SPECIFIC person described in the request — cross-check the name against their known affiliation, role, location, and any other handles already listed as known.
2. Never guess or fabricate a handle. If multiple people share the name, or you cannot confirm a profile belongs to this exact person, return null for that field.
3. Only attempt the fields explicitly listed under "FIELDS TO FIND" in the request — always return null for every other field in the schema.

OUTPUT FORMAT — STRICT REQUIREMENTS:
- Your ENTIRE response MUST be a single JSON object that passes JSON.parse() as-is.
- No prose, no commentary, no markdown code fences.
- Schema (all keys required; null for anything not found or not requested):
{
  "linkedinHandler": string | null,
  "twitterHandler": string | null,
  "githubHandler": string | null,
  "telegramHandler": string | null,
  "blueskyHandler": string | null,
  "confidence": { [field: string]: "high" | "medium" | "low" }
}
`;

/**
 * AI web-search fallback for a member's social handles, used only for fields
 * ScrapingDog can't source directly (either because there's no LinkedIn/X handle on
 * file to scrape from yet, or the field — e.g. Bluesky — isn't part of a LinkedIn/X
 * profile at all). Mirrors `generateMemberBioText`'s gated web-search pattern
 * (`husky/member-bio.util.ts`): same identity-sufficiency gate, same provider/model
 * selection. Unlike team-enrichment, member-enrichment has no second-pass judge, so
 * this call self-gates on `confidence: 'high'` per field before a caller may write
 * the result straight to `Member.<field>`.
 */
@Injectable()
export class MemberEnrichmentAiService {
  private readonly logger = new Logger(MemberEnrichmentAiService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async findMissingSocialHandles(
    member: any,
    missingFields: readonly MemberSocialHandleField[]
  ): Promise<MemberSocialHandleLookupResult> {
    if (missingFields.length === 0 || !hasEnoughIdentifyingInfo(member)) {
      return {};
    }

    try {
      const tools = this.aiProvider.getWebSearchTool(HUSKY_GENERATION_PROVIDER_ENV_VAR, {
        searchContextSize: 'medium',
        userLocation: buildUserLocation(member),
        fallbackProvider: HUSKY_GENERATION_FALLBACK_PROVIDER,
      });

      const { text } = await generateText({
        model: this.aiProvider.getResponsesModel(HUSKY_GENERATION_PROVIDER_ENV_VAR, {
          useSearchGrounding: true,
          fallbackProvider: HUSKY_GENERATION_FALLBACK_PROVIDER,
        }),
        system: MEMBER_SOCIAL_HANDLES_SYSTEM_PROMPT,
        ...(Object.keys(tools).length > 0 && { tools }),
        prompt: this.buildUserPrompt(member, missingFields),
        temperature: 0.2,
      });

      return this.parseResponse(text, missingFields);
    } catch (error) {
      this.logger.warn(`Social handle lookup failed for member ${member?.uid}: ${error.message}`);
      return {};
    }
  }

  private buildUserPrompt(member: any, missingFields: readonly MemberSocialHandleField[]): string {
    const teamRoles = (member.teamMemberRoles ?? [])
      .map((r: any) => `${r.role ?? 'member'} at ${r.team?.name ?? 'unknown team'}`)
      .join('; ');
    const knownHandles = MEMBER_SOCIAL_HANDLE_FIELDS.filter(
      (field) => !missingFields.includes(field) && member[field]
    ).map((field) => `- Known ${field}: ${member[field]}`);

    return `
Find the following social/profile handles for this specific person, if they publicly exist:

- Name: ${member.name}
${teamRoles ? `- Affiliation: ${teamRoles}` : ''}
${
  member.location?.city || member.location?.country
    ? `- Location: ${[member.location?.city, member.location?.country].filter(Boolean).join(', ')}`
    : ''
}
${knownHandles.join('\n')}

FIELDS TO FIND:
${missingFields.map((field) => `- ${field}: ${FIELD_DESCRIPTIONS[field]}`).join('\n')}

Respond with ONLY the JSON object specified in the system prompt.
`;
  }

  private parseResponse(
    text: string,
    missingFields: readonly MemberSocialHandleField[]
  ): MemberSocialHandleLookupResult {
    if (!text || !text.trim()) return {};
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return {};
    }

    const result: MemberSocialHandleLookupResult = {};
    for (const field of missingFields) {
      const raw = parsed[field];
      if (!raw || parsed.confidence?.[field] !== 'high') continue;
      const normalized = this.normalizeHandle(field, raw);
      if (normalized) result[field] = normalized;
    }
    return result;
  }

  private normalizeHandle(field: MemberSocialHandleField, raw: string): string | undefined {
    switch (field) {
      case 'twitterHandler':
        return normalizeTwitterHandle(raw) || undefined;
      case 'telegramHandler':
        return normalizeTelegramHandle(raw) || undefined;
      case 'blueskyHandler':
        return normalizeBlueskyHandler(raw);
      case 'linkedinHandler':
        return (
          raw
            .trim()
            .replace(/^https?:\/\/(?:www\.)?linkedin\.com\//i, '')
            .replace(/^in\//i, '')
            .replace(/[/?#].*$/, '') || undefined
        );
      case 'githubHandler':
        return (
          raw
            .trim()
            .replace(/^@/, '')
            .replace(/^https?:\/\/(?:www\.)?github\.com\//i, '')
            .replace(/[/?#].*$/, '') || undefined
        );
      default:
        return undefined;
    }
  }
}

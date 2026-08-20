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

const MEMBER_BLUESKY_SYSTEM_PROMPT = `
You are verifying a real person's identity to find their public Bluesky (bsky.app) social media handle.

CRITICAL REQUIREMENTS:
1. Only return a handle if you are HIGHLY confident it belongs to the SPECIFIC person described below — cross-check the name against their known affiliation, role, and any other social handles listed.
2. Never guess or fabricate a handle. If multiple people share the name, or you cannot confirm the profile belongs to this exact person, return null.
3. If the person has no discoverable public Bluesky profile, return null.

OUTPUT FORMAT — STRICT REQUIREMENTS:
- Your ENTIRE response MUST be a single JSON object that passes JSON.parse() as-is.
- No prose, no commentary, no markdown code fences.
- Schema (all keys required):
{
  "blueskyHandler": string | null,
  "confidence": "high" | "medium" | "low"
}
`;

export interface MemberBlueskyLookupResult {
  handle: string | null;
}

/**
 * AI web-search fallback for a member's Bluesky handle, used only when the deterministic
 * bio-text scan (`member-enrichment-bluesky.util.ts`) finds nothing. Mirrors
 * `generateMemberBioText`'s gated web-search pattern (`husky/member-bio.util.ts`):
 * same identity-sufficiency gate, same provider/model selection. Unlike team-enrichment,
 * member-enrichment has no second-pass judge, so this call self-gates on `confidence: 'high'`
 * before a caller may write the result straight to `Member.blueskyHandler`.
 */
@Injectable()
export class MemberEnrichmentAiService {
  private readonly logger = new Logger(MemberEnrichmentAiService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  async findBlueskyHandle(member: any): Promise<MemberBlueskyLookupResult> {
    if (!hasEnoughIdentifyingInfo(member)) {
      return { handle: null };
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
        system: MEMBER_BLUESKY_SYSTEM_PROMPT,
        ...(Object.keys(tools).length > 0 && { tools }),
        prompt: this.buildUserPrompt(member),
        temperature: 0.2,
      });

      return this.parseResponse(text);
    } catch (error) {
      this.logger.warn(`Bluesky handle lookup failed for member ${member?.uid}: ${error.message}`);
      return { handle: null };
    }
  }

  private buildUserPrompt(member: any): string {
    const teamRoles = (member.teamMemberRoles ?? [])
      .map((r: any) => `${r.role ?? 'member'} at ${r.team?.name ?? 'unknown team'}`)
      .join('; ');

    return `
Find the Bluesky (bsky.app) handle for this specific person, if one publicly exists:

- Name: ${member.name}
${teamRoles ? `- Affiliation: ${teamRoles}` : ''}
${
  member.location?.city || member.location?.country
    ? `- Location: ${[member.location?.city, member.location?.country].filter(Boolean).join(', ')}`
    : ''
}
${member.linkedinHandler ? `- Known LinkedIn: ${member.linkedinHandler}` : ''}
${member.twitterHandler ? `- Known Twitter/X: ${member.twitterHandler}` : ''}
${member.githubHandler ? `- Known GitHub: ${member.githubHandler}` : ''}

Respond with ONLY the JSON object specified in the system prompt.
`;
  }

  private parseResponse(text: string): MemberBlueskyLookupResult {
    if (!text || !text.trim()) return { handle: null };
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');

    let parsed: any;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { handle: null };
    }

    if (parsed.confidence !== 'high' || !parsed.blueskyHandler) {
      return { handle: null };
    }

    return { handle: normalizeBlueskyHandler(parsed.blueskyHandler) ?? null };
  }
}

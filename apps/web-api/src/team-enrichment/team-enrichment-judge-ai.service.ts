import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import {
  AIJudgeResponse,
  AIUsageEntry,
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  FIELD_JUDGMENT_NOTE_MAX_LENGTH,
  JudgmentSource,
  JudgmentVerdict,
  TEAM_JUDGMENT_ASSESSMENT_MAX_LENGTH,
  TeamJudgment,
  WebsiteSignals,
} from './team-enrichment.types';
import { buildUsageEntry, formatUsageLog } from './team-enrichment-cost';

const TEAM_ENRICHMENT_JUDGE_SYSTEM_PROMPT = `
You are an independent quality-verification judge for AI-enriched venture fund / crypto team data.

Another AI model has filled fields on a team's profile (website, descriptions, socials, industry tags, etc.). Your job is to VERIFY those fields against the real-world identity of the team using web search — not to re-enrich them.

For each field listed in the user prompt, decide:
- confidence: "high" | "medium" | "low" — how confident you are in the enriched value
- score: 0–100 — fine-grained score matching the confidence
- verdict: "agrees" (value looks correct), "disagrees" (value looks wrong), or "uncertain" (you cannot verify)
- note: VERY SHORT tag-style mark explaining the verdict. Max 60 characters. Prefer space-separated keywords like "domain matches", "name not found on web", "url 404". NOT a sentence. No hyphens — use spaces between words.

If a "ScrapingDog pre-verification" block confirms the team's LinkedIn identity, treat that as strong evidence the entity reference is correct — but still verify each individual field value on its own merits.

URL fields (website, blog, contactMethod, social handles): do NOT mark a value as "disagrees" merely because it differs from another URL we already have on file (e.g. the LinkedIn-listed website). Companies routinely use alias domains, product subdomains, or rebrand without updating LinkedIn. Verify each URL on its own merits via web search; prefer "uncertain" when you cannot independently confirm or refute it.

DESCRIPTION FIELDS (shortDescription, longDescription, moreDetails): paraphrasing, summarization, and reworded versions of the team's own LinkedIn / website description are expected and acceptable. The source of these fields is typically the team's own LinkedIn About text or website meta description — exact wording will not match other sources you find via web search. Verdict is "agrees" + "high" as long as the CORE FACTS (mission, products, founding info, team identity) align with what you can verify. Do NOT downgrade to "medium" solely because phrasing differs from what your web search returns — paraphrasing is not a defect.

CONTACT EMAIL RULE: when contactMethod is an email like "user@DOMAIN" and the team's known website host equals DOMAIN (or the website is on a subdomain of DOMAIN), the email's domain corroborates the website host — both are self-declared signals from the team's own assets. The verdict is "agrees", NOT "disagrees" against a different LinkedIn-listed email. Apply the same logic when a "Cross-source signals from website extraction" block declares a contact email whose domain matches.

When a "Corroboration already established by deterministic stage" block is present, the listed fields have ALREADY been verified by a deterministic cross-source check before reaching you. Do not second-guess them; if you must judge one, return "agrees" + "high" unless you find a hard contradiction.

If a "Website reachability" line is present, treat it as a signal — never the only signal:
- "yes" (reachable, 2xx) — the URL is live, but liveness alone does not prove brand identity. Continue to verify the URL belongs to the team via web search.
- "no" (definitive 4xx/5xx) — meaningful negative signal that the URL is stale or wrong. Lean toward "disagrees" for the website verdict if you also can't confirm it via web search.
- "unknown" (not probed or transient network failure) — do not infer either way.

RULES:
- Use "uncertain" rather than guessing when you cannot verify a value.
- Do NOT propose new values. You are judging, not enriching.
- Keep "note" strictly under 60 chars. Space-separated keyword style, not prose. No sentences, no "the value ...", no hyphens — use spaces between words.
- Pay close attention to the EXACT team name. If similarly-named entities exist, verify values are about the provided team, not a lookalike.

Also return:
- overallAssessment: a VERY SHORT summary (max 120 characters) — think compact one-liner, not a paragraph.

OUTPUT FORMAT — STRICT:
- Your ENTIRE response MUST be a single JSON object that passes JSON.parse() as-is.
- The first character of your response MUST be "{" and the last character MUST be "}".
- Do NOT write anything before the "{". No "I'll verify...", no "Based on my knowledge...", no "Here is the JSON...". Nothing.
- Do NOT write anything after the closing "}". No summary, no caveats, no explanation.
- Do NOT wrap the JSON in markdown code fences (no \`\`\`json, no \`\`\`).
- Do NOT use bold/italic/headings anywhere. Plain JSON only.
- Put all commentary INSIDE the "rationale" and "overallAssessment" string fields — never as prose outside the JSON.
- All strings must be valid JSON strings (escape quotes and backslashes).

SCHEMA (all keys required, types must match exactly):
{
  "fields": {
    "<fieldName>": {
      "confidence": "high" | "medium" | "low",
      "score": number (0-100),
      "verdict": "agrees" | "disagrees" | "uncertain",
      "note": string (max 60 chars, hyphenated keywords)
    }
  },
  "overallAssessment": string (max 120 chars)
}
`;

export interface JudgeFieldInput {
  field: FieldMetaKey;
  currentValue: string | string[] | null;
  source?: string;
}

export interface JudgeTeamContext {
  teamName: string;
  website?: string | null;
  linkedinHandler?: string | null;
  twitterHandler?: string | null;
  telegramHandler?: string | null;
  /** Website reachability probe result. true=2xx, false=definitive 4xx/5xx, null=not probed/transient/invalid URL. */
  websiteReachable?: boolean | null;
  /** Post-redirect host (normalized) when reachable; null otherwise. */
  websiteFinalHost?: string | null;
  scrapingDog?: TeamJudgment['scrapingDog'];
  /** Second-source signals scraped from the team's own website (Stage 1.5 input). */
  websiteSignals?: WebsiteSignals | null;
  /** Field keys that Stage 1.5 (or Stage 1) already resolved at agrees+high. Listed for prompt context. */
  corroboratedFields?: string[];
}

@Injectable()
export class TeamEnrichmentJudgeAiService {
  private readonly logger = new Logger(TeamEnrichmentJudgeAiService.name);

  private static readonly PROVIDER_ENV_VAR = 'TEAM_ENRICHMENT_JUDGE_AI_PROVIDER';

  constructor(private readonly aiProvider: AiProviderService) {}

  /** Returns the resolved judge model name (e.g., "gpt-4o", "claude-sonnet-4-6"). */
  getModelName(): string {
    return this.aiProvider.getModelName(TeamEnrichmentJudgeAiService.PROVIDER_ENV_VAR);
  }

  /**
   * Runs the AI judge for a given team + field list. Returns per-field FieldJudgment entries
   * plus the overall assessment + flags. On any failure (bad JSON, AI error, empty response)
   * returns an empty result and caller must treat the run as FailedToJudge.
   */
  async judgeTeamFields(
    context: JudgeTeamContext,
    fields: JudgeFieldInput[]
  ): Promise<{
    verdicts: Partial<Record<FieldMetaKey, FieldJudgment>>;
    overallAssessment: string;
    ok: boolean;
    errorMessage?: string;
    usage: AIUsageEntry | null;
  }> {
    if (fields.length === 0) {
      return { verdicts: {}, overallAssessment: 'No fields to judge.', ok: true, usage: null };
    }

    const providerEnvVar = TeamEnrichmentJudgeAiService.PROVIDER_ENV_VAR;
    const model = this.aiProvider.getModelName(providerEnvVar);
    const startedAt = Date.now();

    try {
      const userPrompt = this.buildUserPrompt(context, fields);
      const tools = this.aiProvider.getWebSearchTool(providerEnvVar, { searchContextSize: 'medium' });

      const { text, usage, experimental_providerMetadata: providerMetadata } = await generateText({
        model: this.aiProvider.getResponsesModel(providerEnvVar, { useSearchGrounding: true }),
        system: TEAM_ENRICHMENT_JUDGE_SYSTEM_PROMPT,
        ...(Object.keys(tools).length > 0 && { tools }),
        prompt: userPrompt,
        temperature: 0.1,
        maxSteps: 3,
      });

      const durationMs = Date.now() - startedAt;
      const usageEntry = buildUsageEntry({ model, usage, providerMetadata, durationMs });

      if (usageEntry) {
        this.logger.log(`AI judge call team="${context.teamName}" stage=judge ok=true ${formatUsageLog(usageEntry)}`);
      } else {
        this.logger.warn(
          `AI judge call team="${context.teamName}" stage=judge ok=true model=${model} durationMs=${durationMs} usage=unavailable`
        );
      }

      if (process.env.DEBUG_ENRICHMENT === 'true') {
        this.logger.debug(`Judge AI response (len=${text?.length ?? 0}): ${text?.substring(0, 500)}`);
      }

      const parsed = this.parseResponse(text, context.teamName);
      if (!parsed) {
        return {
          verdicts: {},
          overallAssessment: '',
          ok: false,
          errorMessage: 'Judge AI response could not be parsed as JSON',
          usage: usageEntry,
        };
      }

      const verdicts = this.mapToVerdicts(parsed, fields);
      return {
        verdicts,
        overallAssessment: this.truncate(parsed.overallAssessment || '', TEAM_JUDGMENT_ASSESSMENT_MAX_LENGTH),
        ok: true,
        usage: usageEntry,
      };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.error(
        `AI judge call team="${context.teamName}" stage=judge ok=false model=${model} durationMs=${durationMs} error="${error.message}"`,
        error.stack
      );
      return {
        verdicts: {},
        overallAssessment: '',
        ok: false,
        errorMessage: error.message,
        usage: null,
      };
    }
  }

  private buildUserPrompt(context: JudgeTeamContext, fields: JudgeFieldInput[]): string {
    const sdBlock = this.renderScrapingDogBlock(context.scrapingDog);
    const wsBlock = this.renderWebsiteSignalsBlock(context.websiteSignals);
    const corroborationBlock = this.renderCorroborationBlock(context.corroboratedFields);

    const identityLines: string[] = [];
    if (context.website) identityLines.push(`Known Website: ${context.website}`);
    if (context.linkedinHandler) identityLines.push(`Known LinkedIn: ${context.linkedinHandler}`);
    if (context.twitterHandler) identityLines.push(`Known Twitter/X: ${context.twitterHandler}`);
    if (context.telegramHandler) identityLines.push(`Known Telegram: ${context.telegramHandler}`);
    if (context.website && context.websiteReachable !== undefined) {
      const reachabilityWord =
        context.websiteReachable === true ? 'yes' : context.websiteReachable === false ? 'no' : 'unknown';
      const finalHostNote =
        context.websiteFinalHost && context.websiteReachable === true
          ? `; final host after redirects: ${context.websiteFinalHost}`
          : '';
      identityLines.push(`Website reachability: ${reachabilityWord}${finalHostNote}`);
    }

    const fieldsBlock = fields
      .map((f) => {
        const valueStr = this.formatFieldValue(f.currentValue);
        const sourceStr = f.source ? ` (source: ${f.source})` : '';
        return `- ${f.field}${sourceStr}: ${valueStr}`;
      })
      .join('\n');

    const optionalBlocks = [sdBlock, wsBlock, corroborationBlock].filter(Boolean).join('\n');

    return `
Team to verify: ${context.teamName}

${identityLines.length > 0 ? identityLines.join('\n') + '\n' : ''}${optionalBlocks ? optionalBlocks + '\n' : ''}
Fields to judge (verify each value belongs to the real "${context.teamName}" team):
${fieldsBlock}

For each field above, return your verdict in the schema specified by the system prompt. Use web search to verify when possible.

Current Date: ${new Date().toISOString().split('T')[0]}
`;
  }

  /**
   * Renders the second-source signals scraped from the team's own website. The AI judge
   * uses these as an independent cross-source confirmation for any field it's about to
   * verify (especially contactMethod email-domain ↔ website-host).
   */
  private renderWebsiteSignalsBlock(ws: WebsiteSignals | null | undefined): string {
    if (!ws) return '';
    const lines: string[] = [];
    if (ws.host) lines.push(`  host: ${ws.host}`);
    if (ws.ogSiteName) lines.push(`  og:site_name: ${ws.ogSiteName}`);
    if (ws.jsonLdOrgName) lines.push(`  jsonld Organization.name: ${ws.jsonLdOrgName}`);
    if (ws.twitterHandler) lines.push(`  declared twitter: ${ws.twitterHandler}`);
    if (ws.linkedinHandler) lines.push(`  declared linkedin: ${ws.linkedinHandler}`);
    if (ws.telegramHandler) lines.push(`  declared telegram: ${ws.telegramHandler}`);
    if (ws.contactEmail) lines.push(`  declared contact email: ${ws.contactEmail}`);
    if (ws.metaDescription) lines.push(`  meta description: ${ws.metaDescription.substring(0, 240)}`);
    if (lines.length === 0) return '';
    return [
      'Cross-source signals from website extraction (second independent source; use to corroborate the fields below):',
      ...lines,
    ].join('\n');
  }

  /**
   * Renders the deterministic-stage corroboration block — telling the AI which fields
   * have already been verified before this call. In normal operation those fields are
   * pulled OUT of the input list before they reach this prompt; this block exists as
   * defense-in-depth for any future change that re-routes them through Stage 2.
   */
  private renderCorroborationBlock(corroborated: string[] | undefined): string {
    if (!corroborated || corroborated.length === 0) return '';
    return `Corroboration already established by deterministic stage: [${corroborated.join(', ')}]`;
  }

  private renderScrapingDogBlock(meta: TeamJudgment['scrapingDog'] | undefined): string {
    if (!meta || !meta.used) return '';
    if (meta.nameMatch === 'exact') {
      return `ScrapingDog pre-verification: LinkedIn identity CONFIRMED (exact name match). LinkedIn company: "${
        meta.companyNameFromLinkedIn ?? 'unknown'
      }". Use this as strong evidence the entity reference is correct; still verify individual field values.`;
    }
    if (meta.nameMatch === 'partial') {
      return `ScrapingDog pre-verification: LinkedIn identity LIKELY (partial name match). LinkedIn company: "${
        meta.companyNameFromLinkedIn ?? 'unknown'
      }". Treat with some caution — the LinkedIn company name does not exactly match the team name.`;
    }
    if (meta.nameMatch === 'none') {
      return `ScrapingDog pre-verification: LinkedIn identity NOT CONFIRMED. The LinkedIn company "${
        meta.companyNameFromLinkedIn ?? 'unknown'
      }" does not match the team name. The AI-supplied LinkedIn handle may be wrong.`;
    }
    return '';
  }

  private formatFieldValue(value: string | string[] | null): string {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return value.length === 0 ? '[]' : `[${value.join(', ')}]`;
    return value;
  }

  private parseResponse(text: string | undefined, teamName: string): AIJudgeResponse | null {
    if (!text || text.trim().length === 0) {
      this.logger.warn(`Judge AI returned empty response for "${teamName}"`);
      return null;
    }
    const trimmed = text
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/, '');
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (error) {
      this.logger.warn(
        `Failed to parse judge AI response for "${teamName}": ${error.message}. Raw (len=${
          text.length
        }): ${text.substring(0, 500)}`
      );
      return null;
    }
    if (!parsed || typeof parsed !== 'object') {
      this.logger.warn(`Judge AI response is not an object for "${teamName}"`);
      return null;
    }
    const shaped = parsed as { fields?: unknown };
    if (!shaped.fields || typeof shaped.fields !== 'object') {
      this.logger.warn(`Judge AI response missing 'fields' object for "${teamName}"`);
      return null;
    }
    return parsed as AIJudgeResponse;
  }

  private mapToVerdicts(
    response: AIJudgeResponse,
    requestedFields: JudgeFieldInput[]
  ): Partial<Record<FieldMetaKey, FieldJudgment>> {
    const requestedKeys = new Set(requestedFields.map((f) => f.field));

    const out: Partial<Record<FieldMetaKey, FieldJudgment>> = {};
    for (const [rawKey, rawValue] of Object.entries(response.fields as Record<string, unknown>)) {
      if (!requestedKeys.has(rawKey as FieldMetaKey)) continue;
      if (!rawValue || typeof rawValue !== 'object') continue;
      const raw = rawValue as Record<string, unknown>;

      const confidence = this.coerceConfidence(raw.confidence);
      const verdict = this.coerceVerdict(raw.verdict);
      if (!confidence || !verdict) continue;

      const score = typeof raw.score === 'number' ? Math.max(0, Math.min(100, Math.round(raw.score))) : undefined;
      const rawNote = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined;
      const note = rawNote ? this.truncate(rawNote, FIELD_JUDGMENT_NOTE_MAX_LENGTH) : undefined;

      out[rawKey as FieldMetaKey] = {
        confidence,
        verdict,
        score,
        note,
        judgedVia: JudgmentSource.AI,
      };
    }
    return out;
  }

  private coerceConfidence(value: unknown): FieldConfidence | null {
    if (typeof value !== 'string') return null;
    const v = value.toLowerCase();
    if (v === 'high') return FieldConfidence.High;
    if (v === 'medium') return FieldConfidence.Medium;
    if (v === 'low') return FieldConfidence.Low;
    return null;
  }

  private coerceVerdict(value: unknown): JudgmentVerdict | null {
    if (typeof value !== 'string') return null;
    const v = value.toLowerCase();
    if (v === 'agrees') return JudgmentVerdict.Agrees;
    if (v === 'disagrees') return JudgmentVerdict.Disagrees;
    if (v === 'uncertain') return JudgmentVerdict.Uncertain;
    return null;
  }

  private truncate(s: string, max: number): string {
    if (!s) return s;
    if (s.length <= max) return s;
    return max > 3 ? s.substring(0, max - 3) + '...' : s.substring(0, max);
  }
}

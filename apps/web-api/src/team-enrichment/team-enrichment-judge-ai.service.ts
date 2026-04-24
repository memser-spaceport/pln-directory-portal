import { Injectable, Logger } from '@nestjs/common';
import { generateText } from 'ai';
import { AiProviderService } from '../shared/ai-provider.service';
import {
  AIJudgeResponse,
  FieldConfidence,
  FieldJudgment,
  FieldMetaKey,
  FIELD_JUDGMENT_NOTE_MAX_LENGTH,
  JudgmentSource,
  JudgmentVerdict,
  TEAM_JUDGMENT_ASSESSMENT_MAX_LENGTH,
  TeamJudgment,
} from './team-enrichment.types';

const TEAM_ENRICHMENT_JUDGE_SYSTEM_PROMPT = `
You are an independent quality-verification judge for AI-enriched venture fund / crypto team data.

Another AI model has filled fields on a team's profile (website, descriptions, socials, industry tags, etc.). Your job is to VERIFY those fields against the real-world identity of the team using web search — not to re-enrich them.

For each field listed in the user prompt, decide:
- confidence: "high" | "medium" | "low" — how confident you are in the enriched value
- score: 0–100 — fine-grained score matching the confidence
- verdict: "agrees" (value looks correct), "disagrees" (value looks wrong), or "uncertain" (you cannot verify)
- note: VERY SHORT tag-style mark explaining the verdict. Max 60 characters. Prefer hyphenated keywords like "domain-matches", "name-not-found-on-web", "url-404". NOT a sentence.

If a "ScrapingDog pre-verification" block confirms the team's LinkedIn identity, treat that as strong evidence the entity reference is correct — but still verify each individual field value on its own merits.

RULES:
- Use "uncertain" rather than guessing when you cannot verify a value.
- Do NOT propose new values. You are judging, not enriching.
- Keep "note" strictly under 60 chars. Hyphenated keyword style, not prose. No sentences, no "the value ...", no punctuation except hyphens.
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
  scrapingDog?: TeamJudgment['scrapingDog'];
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
  }> {
    if (fields.length === 0) {
      return { verdicts: {}, overallAssessment: 'No fields to judge.', ok: true };
    }

    const providerEnvVar = TeamEnrichmentJudgeAiService.PROVIDER_ENV_VAR;

    try {
      const userPrompt = this.buildUserPrompt(context, fields);
      const tools = this.aiProvider.getWebSearchTool(providerEnvVar, { searchContextSize: 'medium' });

      const { text } = await generateText({
        model: this.aiProvider.getResponsesModel(providerEnvVar, { useSearchGrounding: true }),
        system: TEAM_ENRICHMENT_JUDGE_SYSTEM_PROMPT,
        ...(Object.keys(tools).length > 0 && { tools }),
        prompt: userPrompt,
        temperature: 0.1,
        maxSteps: 3,
      });

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
        };
      }

      const verdicts = this.mapToVerdicts(parsed, fields);
      return {
        verdicts,
        overallAssessment: this.truncate(parsed.overallAssessment || '', TEAM_JUDGMENT_ASSESSMENT_MAX_LENGTH),
        ok: true,
      };
    } catch (error) {
      this.logger.error(`Judge AI failed for "${context.teamName}": ${error.message}`, error.stack);
      return {
        verdicts: {},
        overallAssessment: '',
        ok: false,
        errorMessage: error.message,
      };
    }
  }

  private buildUserPrompt(context: JudgeTeamContext, fields: JudgeFieldInput[]): string {
    const sdBlock = this.renderScrapingDogBlock(context.scrapingDog);

    const identityLines: string[] = [];
    if (context.website) identityLines.push(`Known Website: ${context.website}`);
    if (context.linkedinHandler) identityLines.push(`Known LinkedIn: ${context.linkedinHandler}`);
    if (context.twitterHandler) identityLines.push(`Known Twitter/X: ${context.twitterHandler}`);
    if (context.telegramHandler) identityLines.push(`Known Telegram: ${context.telegramHandler}`);

    const fieldsBlock = fields
      .map((f) => {
        const valueStr = this.formatFieldValue(f.currentValue);
        const sourceStr = f.source ? ` (source: ${f.source})` : '';
        return `- ${f.field}${sourceStr}: ${valueStr}`;
      })
      .join('\n');

    return `
Team to verify: ${context.teamName}

${identityLines.length > 0 ? identityLines.join('\n') + '\n' : ''}${sdBlock ? sdBlock + '\n' : ''}
Fields to judge (verify each value belongs to the real "${context.teamName}" team):
${fieldsBlock}

For each field above, return your verdict in the schema specified by the system prompt. Use web search to verify when possible.

Current Date: ${new Date().toISOString().split('T')[0]}
`;
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

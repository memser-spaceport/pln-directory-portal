import { Logger } from '@nestjs/common';
import type { LanguageModelUsage, ProviderMetadata } from 'ai';
import { AIUsageEntry } from './team-enrichment.types';

/**
 * Per-model published per-token rates (USD per 1M tokens). Approximate — providers
 * change pricing periodically and not all tiers (cached input, thought tokens,
 * batch discount, web-search-grounding) are reflected here. The persisted token
 * counts are the source of truth; cost is an estimate for budgeting and dashboards.
 *
 * Sources (Jan 2026 reference):
 *  - Gemini: https://ai.google.dev/pricing
 *  - OpenAI: https://openai.com/api/pricing/
 *  - Anthropic: https://www.anthropic.com/pricing#api
 *
 * Lookup is by exact model id, then by prefix match. Unknown models fall back
 * to a `costUsd: 0` estimate plus a warn-level log so we notice.
 */
interface ModelPricing {
  inputPer1M: number;
  outputPer1M: number;
  /** Cached prompt tokens billed at a discount when the provider supports it. */
  cachedInputPer1M?: number;
}

const PRICING_TABLE: Record<string, ModelPricing> = {
  // Gemini
  'gemini-2.5-flash': { inputPer1M: 0.3, outputPer1M: 2.5, cachedInputPer1M: 0.075 },
  'gemini-2.5-flash-lite': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.5-pro': { inputPer1M: 1.25, outputPer1M: 10.0, cachedInputPer1M: 0.31 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5.0 },

  // OpenAI
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10.0, cachedInputPer1M: 1.25 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6, cachedInputPer1M: 0.075 },
  'gpt-4.1': { inputPer1M: 2.0, outputPer1M: 8.0, cachedInputPer1M: 0.5 },
  'gpt-4.1-mini': { inputPer1M: 0.4, outputPer1M: 1.6 },

  // Anthropic
  'claude-opus-4-7': { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  'claude-opus-4-1': { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  'claude-opus-4': { inputPer1M: 15.0, outputPer1M: 75.0, cachedInputPer1M: 1.5 },
  'claude-sonnet-4-6': { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  'claude-sonnet-4': { inputPer1M: 3.0, outputPer1M: 15.0, cachedInputPer1M: 0.3 },
  'claude-haiku-4-5': { inputPer1M: 1.0, outputPer1M: 5.0, cachedInputPer1M: 0.1 },
};

const costLogger = new Logger('TeamEnrichmentCost');

function lookupPricing(model: string): ModelPricing | null {
  if (PRICING_TABLE[model]) return PRICING_TABLE[model];
  // Prefix match — handles versioned ids like "claude-sonnet-4-5-20250929".
  for (const key of Object.keys(PRICING_TABLE)) {
    if (model.startsWith(key)) return PRICING_TABLE[key];
  }
  return null;
}

/**
 * Pulls cached-input-token count from provider-specific metadata when present.
 * Each provider names this differently; we try the known shapes and gracefully
 * fall back to undefined (which means "no cache discount applied").
 */
function extractCachedInputTokens(providerMetadata?: ProviderMetadata): number | undefined {
  if (!providerMetadata) return undefined;
  const md = providerMetadata as Record<string, Record<string, unknown> | undefined>;

  // Gemini — google.usageMetadata.cachedContentTokenCount
  const googleUsage = md.google?.usageMetadata as Record<string, unknown> | undefined;
  if (googleUsage && typeof googleUsage.cachedContentTokenCount === 'number') {
    return googleUsage.cachedContentTokenCount;
  }

  // Anthropic — anthropic.cacheReadInputTokens (and cacheCreationInputTokens, but those bill at a premium)
  const anthropicMeta = md.anthropic as Record<string, unknown> | undefined;
  if (anthropicMeta && typeof anthropicMeta.cacheReadInputTokens === 'number') {
    return anthropicMeta.cacheReadInputTokens;
  }

  // OpenAI — openai.cachedPromptTokens / cached_tokens
  const openaiMeta = md.openai as Record<string, unknown> | undefined;
  if (openaiMeta) {
    const cached =
      (typeof openaiMeta.cachedPromptTokens === 'number' && openaiMeta.cachedPromptTokens) ||
      (typeof openaiMeta.cached_tokens === 'number' && (openaiMeta.cached_tokens as number));
    if (typeof cached === 'number') return cached;
  }

  return undefined;
}

/**
 * Builds a fresh `AIUsageEntry` from a single `generateText` result. Returns null
 * when the SDK didn't supply a usage object (e.g. a cached/streamed path that
 * doesn't populate it) — callers should treat that as "no usage to record" rather
 * than fail.
 */
export function buildUsageEntry(params: {
  model: string;
  usage: LanguageModelUsage | undefined;
  providerMetadata?: ProviderMetadata;
  durationMs: number;
}): AIUsageEntry | null {
  if (!params.usage) return null;
  const { promptTokens, completionTokens, totalTokens } = params.usage;
  const cachedInputTokens = extractCachedInputTokens(params.providerMetadata);

  const pricing = lookupPricing(params.model);
  let costUsd = 0;
  if (pricing) {
    const billableInput = Math.max(0, promptTokens - (cachedInputTokens ?? 0));
    const inputCost = (billableInput / 1_000_000) * pricing.inputPer1M;
    const cachedCost =
      cachedInputTokens && pricing.cachedInputPer1M
        ? (cachedInputTokens / 1_000_000) * pricing.cachedInputPer1M
        : 0;
    const outputCost = (completionTokens / 1_000_000) * pricing.outputPer1M;
    costUsd = roundCents(inputCost + cachedCost + outputCost);
  } else {
    costLogger.warn(
      `No pricing entry for model "${params.model}" — costUsd will be 0. Add it to PRICING_TABLE in team-enrichment-cost.ts.`
    );
  }

  return {
    inputTokens: promptTokens,
    outputTokens: completionTokens,
    ...(cachedInputTokens !== undefined ? { cachedInputTokens } : {}),
    totalTokens,
    costUsd,
    aiModel: params.model,
    durationMs: params.durationMs,
    runs: 1,
    lastRunAt: new Date().toISOString(),
  };
}

/**
 * Sums two usage entries. Used when a team is force-re-enriched (the new run
 * accumulates on top of the prior one) or when a stage produces multiple AI
 * calls in a single pipeline run.
 */
export function mergeUsageEntries(prior: AIUsageEntry | undefined, fresh: AIUsageEntry | null): AIUsageEntry | undefined {
  if (!fresh) return prior;
  if (!prior) return fresh;
  return {
    inputTokens: prior.inputTokens + fresh.inputTokens,
    outputTokens: prior.outputTokens + fresh.outputTokens,
    cachedInputTokens:
      prior.cachedInputTokens !== undefined || fresh.cachedInputTokens !== undefined
        ? (prior.cachedInputTokens ?? 0) + (fresh.cachedInputTokens ?? 0)
        : undefined,
    totalTokens: prior.totalTokens + fresh.totalTokens,
    costUsd: roundCents(prior.costUsd + fresh.costUsd),
    aiModel: fresh.aiModel,
    durationMs: prior.durationMs + fresh.durationMs,
    runs: prior.runs + fresh.runs,
    lastRunAt: fresh.lastRunAt,
  };
}

function roundCents(amount: number): number {
  return Math.round(amount * 1_000_000) / 1_000_000;
}

/**
 * Renders a single usage entry to a one-line keyword-style log payload.
 * Use as the suffix in structured `logger.log("... usage=" + formatUsageLog(entry))`.
 */
export function formatUsageLog(entry: AIUsageEntry): string {
  const parts = [
    `model=${entry.aiModel}`,
    `inputTokens=${entry.inputTokens}`,
    `outputTokens=${entry.outputTokens}`,
  ];
  if (entry.cachedInputTokens !== undefined) parts.push(`cachedInputTokens=${entry.cachedInputTokens}`);
  parts.push(
    `totalTokens=${entry.totalTokens}`,
    `costUsd=${entry.costUsd.toFixed(6)}`,
    `durationMs=${entry.durationMs}`,
    `runs=${entry.runs}`
  );
  return parts.join(' ');
}

import type { AiProviderType } from '../shared/ai-provider.service';

/**
 * Provider selection for Husky AI search (chat answers, chat summaries, thread titles).
 * Set HUSKY_SEARCH_AI_PROVIDER=gemini|anthropic|openai to switch; defaults to Gemini
 * regardless of the global AI_PROVIDER.
 */
export const HUSKY_SEARCH_PROVIDER_ENV_VAR = 'HUSKY_SEARCH_AI_PROVIDER';
export const HUSKY_SEARCH_FALLBACK_PROVIDER: AiProviderType = 'gemini';

/** `true` (any case) runs Husky search answers on Opus. Anything else keeps the current provider. */
export const HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR = 'HUSKY_SEARCH_OPUS_ENABLED';

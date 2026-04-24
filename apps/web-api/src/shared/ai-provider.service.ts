import { Injectable, Logger } from '@nestjs/common';
import { LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { anthropic, createAnthropic, AnthropicProvider } from '@ai-sdk/anthropic';
import { z } from 'zod';

export type AiProviderType = 'openai' | 'gemini' | 'anthropic';

const VALID_PROVIDERS: ReadonlySet<AiProviderType> = new Set(['openai', 'gemini', 'anthropic']);

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly defaultProvider: AiProviderType;
  private anthropicClient?: AnthropicProvider;

  constructor() {
    this.defaultProvider = (process.env.AI_PROVIDER as AiProviderType) || 'gemini';
    this.logger.log(`Default AI provider: ${this.defaultProvider}`);
  }

  /**
   * Lazily build a Claude client that reads its API key from `CLAUDE_API_KEY`
   * (with `ANTHROPIC_API_KEY` as a fallback for SDK-default compatibility).
   * Returns the default exported `anthropic` client when neither is set, so
   * the SDK produces its usual "missing key" error downstream.
   */
  private getAnthropicClient(): AnthropicProvider {
    if (this.anthropicClient) return this.anthropicClient;
    const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    this.anthropicClient = apiKey ? createAnthropic({ apiKey }) : anthropic;
    return this.anthropicClient;
  }

  /**
   * Resolves the effective provider for a given feature.
   * Checks for a feature-specific override env var (e.g., TEAM_ENRICHMENT_AI_PROVIDER),
   * then falls back to the global AI_PROVIDER.
   */
  private resolveProvider(featureProviderEnvVar?: string): AiProviderType {
    if (featureProviderEnvVar) {
      const override = process.env[featureProviderEnvVar] as AiProviderType | undefined;
      if (override && VALID_PROVIDERS.has(override)) {
        return override;
      }
    }
    return this.defaultProvider;
  }

  /**
   * Returns a LanguageModel for generateText with tool support.
   *
   * For OpenAI: uses the Responses API (openai.responses()).
   * For Gemini: uses google() with useSearchGrounding enabled, since
   *   Gemini v1 SDK uses model-level search grounding instead of a separate tool.
   * For Anthropic: uses anthropic() with the configured Claude model.
   *
   * @param featureProviderEnvVar - optional env var name for feature-specific provider override
   * @param options - additional options (e.g., enable search grounding for Gemini)
   */
  getResponsesModel(featureProviderEnvVar?: string, options?: { useSearchGrounding?: boolean }): LanguageModel {
    const provider = this.resolveProvider(featureProviderEnvVar);

    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return google(model, {
        useSearchGrounding: options?.useSearchGrounding ?? true,
      }) as unknown as LanguageModel;
    }

    if (provider === 'anthropic') {
      const model = process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
      return this.getAnthropicClient()(model) as LanguageModel;
    }

    const model = process.env.OPENAI_LLM_MODEL || 'gpt-4o';
    return openai.responses(model) as LanguageModel;
  }

  /**
   * Returns web search tool configuration.
   * For OpenAI: returns web_search_preview tool.
   * For Gemini: returns empty object (search grounding is set at model level).
   * For Anthropic: returns Claude's web_search tool as a provider-defined tool.
   *   The underlying @ai-sdk/anthropic@1.x does not yet translate this id to the
   *   Anthropic API, so the SDK emits an "unsupported-tool" warning and Claude
   *   responds from training knowledge. The shape is kept forward-compatible
   *   with later SDK versions that support server-side web search natively.
   */
  getWebSearchTool(
    featureProviderEnvVar?: string,
    options?: {
      searchContextSize?: 'low' | 'medium' | 'high';
      userLocation?: { type: 'approximate'; city?: string; country?: string };
      anthropicMaxUses?: number;
    }
  ): Record<string, any> {
    const provider = this.resolveProvider(featureProviderEnvVar);

    if (provider === 'gemini') {
      return {};
    }

    if (provider === 'anthropic') {
      return {
        web_search: {
          type: 'provider-defined' as const,
          id: 'anthropic.web_search_20250305',
          args: {
            maxUses: options?.anthropicMaxUses ?? 5,
            ...(options?.userLocation && {
              userLocation: {
                type: 'approximate',
                ...(options.userLocation.city && { city: options.userLocation.city }),
                ...(options.userLocation.country && { country: options.userLocation.country }),
              },
            }),
          },
          parameters: z.object({ query: z.string() }),
        },
      };
    }

    return {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: options?.searchContextSize || 'medium',
        ...(options?.userLocation && { userLocation: options.userLocation }),
      }),
    };
  }

  /**
   * Returns the resolved model name string (e.g., "gpt-4o", "gemini-2.5-flash", "claude-sonnet-4-6").
   */
  getModelName(featureProviderEnvVar?: string): string {
    const provider = this.resolveProvider(featureProviderEnvVar);

    if (provider === 'gemini') {
      return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }
    if (provider === 'anthropic') {
      return process.env.CLAUDE_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
    }
    return process.env.OPENAI_LLM_MODEL || 'gpt-4o';
  }
}

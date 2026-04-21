import { Injectable, Logger } from '@nestjs/common';
import { LanguageModel } from 'ai';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';

export type AiProviderType = 'openai' | 'gemini';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly defaultProvider: AiProviderType;

  constructor() {
    this.defaultProvider = (process.env.AI_PROVIDER as AiProviderType) || 'openai';
    this.logger.log(`Default AI provider: ${this.defaultProvider}`);
  }

  /**
   * Resolves the effective provider for a given feature.
   * Checks for a feature-specific override env var (e.g., TEAM_ENRICHMENT_AI_PROVIDER),
   * then falls back to the global AI_PROVIDER.
   */
  private resolveProvider(featureProviderEnvVar?: string): AiProviderType {
    if (featureProviderEnvVar) {
      const override = process.env[featureProviderEnvVar] as AiProviderType | undefined;
      if (override === 'openai' || override === 'gemini') {
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
   *
   * @param featureProviderEnvVar - optional env var name for feature-specific provider override
   * @param modelEnvVar - optional env var name for OpenAI model override
   * @param options - additional options (e.g., enable search grounding for Gemini)
   */
  getResponsesModel(
    featureProviderEnvVar?: string,
    modelEnvVar?: string,
    options?: { useSearchGrounding?: boolean }
  ): LanguageModel {
    const provider = this.resolveProvider(featureProviderEnvVar);

    if (provider === 'gemini') {
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      return google(model, {
        useSearchGrounding: options?.useSearchGrounding ?? true,
      }) as unknown as LanguageModel;
    }

    const model = (modelEnvVar && process.env[modelEnvVar]) || process.env.OPENAI_LLM_MODEL || 'gpt-4o';
    return openai.responses(model) as LanguageModel;
  }

  /**
   * Returns web search tool configuration.
   * For OpenAI: returns web_search_preview tool.
   * For Gemini: returns empty object (search grounding is set at model level).
   */
  getWebSearchTool(
    featureProviderEnvVar?: string,
    options?: {
      searchContextSize?: 'low' | 'medium' | 'high';
      userLocation?: { type: 'approximate'; city?: string; country?: string };
    }
  ): Record<string, any> {
    const provider = this.resolveProvider(featureProviderEnvVar);

    if (provider === 'gemini') {
      // Gemini v1 SDK uses model-level search grounding, no separate tool needed
      return {};
    }

    return {
      web_search_preview: openai.tools.webSearchPreview({
        searchContextSize: options?.searchContextSize || 'medium',
        ...(options?.userLocation && { userLocation: options.userLocation }),
      }),
    };
  }

  /**
   * Returns the resolved model name string (e.g., "gpt-4o", "gemini-2.5-flash").
   */
  getModelName(featureProviderEnvVar?: string, modelEnvVar?: string): string {
    const provider = this.resolveProvider(featureProviderEnvVar);
    if (provider === 'gemini') {
      return process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    }
    return (modelEnvVar && process.env[modelEnvVar]) || process.env.OPENAI_LLM_MODEL || 'gpt-4o';
  }
}

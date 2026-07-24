// The @ai-sdk/* packages ship untranspiled ESM this jest config can't parse;
// resolution logic under test never reaches them.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));

import { AiProviderService } from './ai-provider.service';

/**
 * Locks the provider-resolution precedence: feature env var > per-feature
 * fallback > global AI_PROVIDER > 'gemini'. The per-feature fallback is what
 * keeps Husky generation pinned to OpenAI when HUSKY_GENERATION_AI_PROVIDER
 * is unset — a regression here silently flips its provider on deploy.
 */
describe('AiProviderService provider resolution', () => {
  const FEATURE_VAR = 'TESTFEATURE_AI_PROVIDER';
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.AI_PROVIDER;
    delete process.env[FEATURE_VAR];
    process.env.OPENAI_LLM_MODEL = 'openai-model';
    process.env.GEMINI_MODEL = 'gemini-model';
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('feature env var wins over the fallback provider', () => {
    process.env[FEATURE_VAR] = 'gemini';
    const service = new AiProviderService();
    expect(service.getModelName(FEATURE_VAR, 'openai')).toBe('gemini-model');
  });

  it('fallback provider wins over the global AI_PROVIDER when the feature var is unset', () => {
    process.env.AI_PROVIDER = 'gemini';
    const service = new AiProviderService();
    expect(service.getModelName(FEATURE_VAR, 'openai')).toBe('openai-model');
  });

  it('global AI_PROVIDER applies when neither feature var nor fallback is given', () => {
    process.env.AI_PROVIDER = 'openai';
    const service = new AiProviderService();
    expect(service.getModelName(FEATURE_VAR)).toBe('openai-model');
  });

  it('defaults to gemini with no feature var, no fallback, and no AI_PROVIDER', () => {
    const service = new AiProviderService();
    expect(service.getModelName(FEATURE_VAR)).toBe('gemini-model');
  });

  it('ignores an invalid feature env var value and uses the fallback', () => {
    process.env[FEATURE_VAR] = 'not-a-provider';
    const service = new AiProviderService();
    expect(service.getModelName(FEATURE_VAR, 'openai')).toBe('openai-model');
  });

  it('returns the web_search_preview tool only for openai', () => {
    const service = new AiProviderService();
    expect(service.getWebSearchTool(FEATURE_VAR, { fallbackProvider: 'openai' })).toHaveProperty(
      'web_search_preview'
    );
    process.env[FEATURE_VAR] = 'gemini';
    expect(service.getWebSearchTool(FEATURE_VAR, { fallbackProvider: 'openai' })).toEqual({});
  });
});

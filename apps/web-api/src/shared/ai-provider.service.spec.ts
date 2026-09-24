// The @ai-sdk/* packages ship untranspiled ESM this jest config can't parse;
// resolution logic under test never reaches them.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));

import { createAnthropic } from '@ai-sdk/anthropic';
import {
  AiProviderService,
  isOpusReasoningSseEvent,
  prepareOpusRequestBody,
  recordOpusSse,
} from './ai-provider.service';

/**
 * Locks the provider-resolution precedence: feature env var > per-feature
 * fallback > global AI_PROVIDER > 'gemini'. The per-feature fallback is what
 * pins Husky generation to HUSKY_GENERATION_FALLBACK_PROVIDER when
 * HUSKY_GENERATION_AI_PROVIDER is unset, independent of AI_PROVIDER — a
 * regression here silently changes its provider on deploy.
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

  it('forces the provider and model id when overrides are set, ignoring the feature env and CLAUDE_MODEL', async () => {
    process.env[FEATURE_VAR] = 'gemini';
    process.env.CLAUDE_MODEL = 'claude-sonnet-4-6';
    delete process.env.CLAUDE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_AUTH_MODE;
    const model = jest.fn();
    (createAnthropic as jest.Mock).mockReturnValue(model);
    const fetchMock = jest.fn().mockResolvedValue({});
    globalThis.fetch = fetchMock as typeof fetch;
    const service = new AiProviderService();

    service.getResponsesModel(FEATURE_VAR, {
      useSearchGrounding: false,
      providerOverride: 'anthropic',
      modelOverride: 'claude-opus-5-5',
    });

    expect(model).toHaveBeenCalledWith('claude-opus-5-5');
    const fetchImpl = (createAnthropic as jest.Mock).mock.calls[0][0].fetch as typeof fetch;
    await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-opus-5-5', temperature: 0, max_tokens: 4096 }),
    });
    const sent = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(sent).toEqual({ model: 'claude-opus-5-5', max_tokens: 4096 });
    expect(sent).not.toHaveProperty('temperature');
    expect(sent).not.toHaveProperty('thinking');
  });

  it('drops thinking stream events this SDK cannot handle', () => {
    const thinking = 'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}';
    const delta = 'data: {"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"x"}}';
    const signature = 'data: {"type":"content_block_delta","delta":{"type":"signature_delta","signature":"abc"}}';
    const redacted = 'data: {"type":"content_block_start","content_block":{"type":"redacted_thinking","data":"x"}}';
    const text = 'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}';
    expect(isOpusReasoningSseEvent(thinking)).toBe(true);
    expect(isOpusReasoningSseEvent(delta)).toBe(true);
    expect(isOpusReasoningSseEvent(signature)).toBe(true);
    expect(isOpusReasoningSseEvent(redacted)).toBe(true);
    expect(isOpusReasoningSseEvent(text)).toBe(false);
  });

  it('puts the captured thinking block back on the tool-call follow-up and does not disable thinking', () => {
    recordOpusSse(
      [
        'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}',
        'data: {"type":"content_block_stop","index":0}',
        'data: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"toolu_1","name":"getDemoDayTeams"}}',
        'data: {"type":"content_block_stop","index":1}',
        'data: {"type":"message_stop"}',
      ].join('\n\n')
    );

    const sent = JSON.parse(
      prepareOpusRequestBody(
        JSON.stringify({
          model: 'claude-opus-5-5',
          temperature: 0,
          thinking: { type: 'disabled' },
          messages: [
            { role: 'user', content: 'hi' },
            {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 'toolu_1', name: 'getDemoDayTeams', input: {} }],
            },
          ],
        })
      )
    );

    expect(sent).not.toHaveProperty('temperature');
    expect(sent).not.toHaveProperty('thinking');
    expect(sent.messages[1].content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig-1' },
      { type: 'tool_use', id: 'toolu_1', name: 'getDemoDayTeams', input: {} },
    ]);
  });

  it('returns the web_search_preview tool only for openai', () => {
    const service = new AiProviderService();
    expect(service.getWebSearchTool(FEATURE_VAR, { fallbackProvider: 'openai' })).toHaveProperty('web_search_preview');
    process.env[FEATURE_VAR] = 'gemini';
    expect(service.getWebSearchTool(FEATURE_VAR, { fallbackProvider: 'openai' })).toEqual({});
  });
});

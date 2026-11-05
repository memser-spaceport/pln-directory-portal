const generateText = jest.fn();
// `ai` pulls in untranspiled ESM this jest config can't parse.
jest.mock('ai', () => ({
  generateText: (...args: unknown[]) => generateText(...args),
  tool: (definition: unknown) => definition,
}));
jest.mock('../../shared/ai-provider.service', () => ({ AiProviderService: jest.fn() }));

import {
  MAX_WEB_PAGES,
  WEB_RESULTS_HEADER,
  WEB_SEARCH_NOT_AVAILABLE,
  WEB_SEARCH_TIMEOUT_MS,
  WebSearchTool,
} from './web-search.tool';
import { HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR, HUSKY_SEARCH_PROVIDER_ENV_VAR } from '../husky-search.constants';

describe('WebSearchTool', () => {
  const logger = { info: jest.fn(), error: jest.fn() };
  const aiProvider = {
    getResponsesModel: jest.fn().mockReturnValue('model'),
    getWebSearchTool: jest.fn().mockReturnValue({ web_search_preview: 'openai-web-search' }),
  };
  const webSearch = new WebSearchTool(logger as any, aiProvider as any);
  const run = (query: string) => (webSearch.getTool() as any).execute({ query }, { toolCallId: 'c1', messages: [] });

  const grounded = {
    text: 'Saturn Grid builds grid storage software.\n\nSources:\nhttps://ignored.example',
    experimental_providerMetadata: {
      google: {
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://saturngrid.example/about', title: 'saturngrid.example' } },
            { web: { uri: 'https://news.example/seed', title: 'Saturn [Grid] raises seed' } },
            { web: { uri: 'https://saturngrid.example/about', title: 'duplicate' } },
            { retrievedContext: { uri: 'gs://bucket/file', title: 'not web' } },
          ],
        },
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[HUSKY_SEARCH_PROVIDER_ENV_VAR];
    delete process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR];
  });

  it('returns the web summary and one [WebLink] line for each page found', async () => {
    generateText.mockResolvedValue(grounded);

    const result = await run('Saturn Grid');

    expect(result).toBe(
      [
        WEB_RESULTS_HEADER,
        'Summary: Saturn Grid builds grid storage software.',
        'Web page: saturngrid.example [WebLink](https://saturngrid.example/about)\n' +
          'Web page: Saturn Grid raises seed [WebLink](https://news.example/seed)',
      ].join('\n\n')
    );
  });

  it('sends only the query the model wrote, with a grounded Gemini model and a 20 s limit', async () => {
    generateText.mockResolvedValue(grounded);

    await run('  zero-knowledge proof  ');

    expect(aiProvider.getResponsesModel).toHaveBeenCalledWith(undefined, {
      providerOverride: 'gemini',
      useSearchGrounding: true,
    });
    const call = generateText.mock.calls[0][0];
    expect(call.prompt).toBe('zero-knowledge proof');
    expect(call.tools).toBeUndefined();
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
    expect(WEB_SEARCH_TIMEOUT_MS).toBe(20_000);
  });

  it('uses the OpenAI web search tool and reads the page URLs from the text when the provider is OpenAI', async () => {
    process.env[HUSKY_SEARCH_PROVIDER_ENV_VAR] = 'openai';
    generateText.mockResolvedValue({
      text: 'A zero-knowledge proof shows a statement is true without revealing why.\n\nSources:\nhttps://zk.example/intro.\nhttps://zk.example/faq',
    });

    const result = await run('zero-knowledge proof');

    expect(generateText.mock.calls[0][0].tools).toEqual({ web_search_preview: 'openai-web-search' });
    expect(result).toContain('Summary: A zero-knowledge proof shows a statement is true without revealing why.');
    expect(result).toContain('Web page: https://zk.example/intro [WebLink](https://zk.example/intro)');
    expect(result).toContain('[WebLink](https://zk.example/faq)');
    expect(result).not.toContain('Sources:');
  });

  it.each([
    ['anthropic', undefined],
    ['openai', 'true'],
  ])('searches with Gemini when the provider is %s (Opus enabled: %s)', (provider, opus) => {
    process.env[HUSKY_SEARCH_PROVIDER_ENV_VAR] = provider;
    if (opus) process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR] = opus;
    expect(webSearch.resolveSearchProvider()).toBe('gemini');
  });

  it('returns "web search not available" and logs when the call fails or times out', async () => {
    generateText.mockRejectedValue(new Error('The operation was aborted due to timeout'));

    await expect(run('Saturn Grid')).resolves.toBe(WEB_SEARCH_NOT_AVAILABLE);
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('aborted due to timeout'));
  });

  it('aborts the web call after the time limit', async () => {
    jest.useFakeTimers();
    let signal: AbortSignal | undefined;
    generateText.mockImplementation(
      (options: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal = options.abortSignal;
          options.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const pending = run('slow');
    jest.advanceTimersByTime(WEB_SEARCH_TIMEOUT_MS);

    await expect(pending).resolves.toBe(WEB_SEARCH_NOT_AVAILABLE);
    expect(signal?.aborted).toBe(true);
    jest.useRealTimers();
  });

  it('returns "web search not available" when the search found no page', async () => {
    generateText.mockResolvedValue({ text: 'I could not find anything.', experimental_providerMetadata: {} });

    await expect(run('nothing')).resolves.toBe(WEB_SEARCH_NOT_AVAILABLE);
    expect(logger.error).toHaveBeenCalled();
  });

  it('replaces a Gemini grounding redirect with the page URL from its Location header', async () => {
    const redirect = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123';
    const failing = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/Broken';
    const fetchMock = jest.fn(async (url: string) => {
      if (url === failing) throw new Error('network down');
      return { headers: { get: () => 'https://saturngrid.example/about' } };
    });
    global.fetch = fetchMock as any;
    generateText.mockResolvedValue({
      text: 'Saturn Grid builds storage. Sources: https://inline.example',
      experimental_providerMetadata: {
        google: {
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: redirect, title: 'saturngrid.example' } },
              { web: { uri: failing, title: 'other.example' } },
            ],
          },
        },
      },
    });

    const result = await run('Saturn Grid');

    expect(fetchMock).toHaveBeenCalledWith(redirect, expect.objectContaining({ redirect: 'manual' }));
    expect(result).toContain('Web page: saturngrid.example [WebLink](https://saturngrid.example/about)');
    expect(result).toContain(`Web page: other.example [WebLink](${failing})`);
    expect(result).toContain('Summary: Saturn Grid builds storage.');
    expect(result).not.toContain('inline.example');
  });

  it('stops the web call when the answer stream is aborted', async () => {
    let signal: AbortSignal | undefined;
    generateText.mockImplementation(
      (options: { abortSignal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal = options.abortSignal;
          options.abortSignal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );
    const parent = new AbortController();

    const pending = (webSearch.getTool() as any).execute(
      { query: 'slow' },
      { toolCallId: 'c1', messages: [], abortSignal: parent.signal }
    );
    parent.abort();

    await expect(pending).resolves.toBe(WEB_SEARCH_NOT_AVAILABLE);
    expect(signal?.aborted).toBe(true);
  });

  it(`keeps at most ${MAX_WEB_PAGES} pages`, async () => {
    const urls = Array.from({ length: 9 }, (_, i) => `https://p${i}.example`);
    generateText.mockResolvedValue({ text: `Summary text.\n\nSources:\n${urls.join('\n')}` });
    process.env[HUSKY_SEARCH_PROVIDER_ENV_VAR] = 'openai';

    const result = await run('many pages');

    expect(result.match(/^Web page: /gm)).toHaveLength(MAX_WEB_PAGES);
  });
});

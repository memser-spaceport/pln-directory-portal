// The @ai-sdk/* packages ship untranspiled ESM this jest config can't parse;
// the provider objects are never invoked here because `ai` itself is mocked.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
jest.mock('ai', () => ({
  streamText: jest.fn(),
  streamObject: jest.fn(),
  generateText: jest.fn(),
}));

import { streamText, streamObject, generateText } from 'ai';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import {
  HuskyAiService,
  encodeJsonStringFragment,
  HUSKY_SEARCH_FALLBACK_PROVIDER,
  HUSKY_SEARCH_PROVIDER_ENV_VAR,
} from './husky-ai.service';

if (!(globalThis as any).ReadableStream) {
  // The jest node environment predates the web streams globals this Node runtime has.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (globalThis as any).ReadableStream = require('stream/web').ReadableStream;
}

const streamTextMock = streamText as jest.Mock;
const streamObjectMock = streamObject as jest.Mock;
const generateTextMock = generateText as jest.Mock;

async function* chunks(parts: string[]) {
  for (const part of parts) {
    yield part;
  }
}

async function* failingChunks(parts: string[], error: Error) {
  for (const part of parts) {
    yield part;
  }
  throw error;
}

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value);
  }
  return out;
}

async function flushBackgroundWork() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const STRUCTURED = {
  followUpQuestions: ['What does the team build?'],
  sources: ['https://example.com/team'],
  actions: [{ name: 'Example Team', directoryLink: '/teams/abc', type: 'Team' }],
};

function structuredStream(parts: string[], object: Promise<unknown> = Promise.resolve(STRUCTURED)) {
  return { textStream: chunks(parts), object };
}

describe('encodeJsonStringFragment', () => {
  it('escapes everything a JSON string literal cannot hold raw', () => {
    const raw = 'say "hi"\\path\nnew line\ttab \u0001 end';
    expect(JSON.parse(`"${encodeJsonStringFragment(raw)}"`)).toBe(raw);
  });
});

describe('HuskyAiService.createContextualToolsResponse', () => {
  const chatInfo = { question: 'Tell me about Example Team', threadId: 'thread-1', chatId: 'chat-1' };

  let cache: { get: jest.Mock; set: jest.Mock };
  let persistent: {
    getDocByKeyValue: jest.Mock;
    create: jest.Mock;
    updateDocByKeyValue: jest.Mock;
    upsertByKeyValue: jest.Mock;
  };
  let aiProvider: { getResponsesModel: jest.Mock };
  let logger: { error: jest.Mock; info: jest.Mock };
  let service: HuskyAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    persistent = {
      getDocByKeyValue: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      updateDocByKeyValue: jest.fn().mockResolvedValue(undefined),
      upsertByKeyValue: jest.fn().mockResolvedValue(undefined),
    };
    aiProvider = { getResponsesModel: jest.fn().mockReturnValue('model-handle') };
    logger = { error: jest.fn(), info: jest.fn() };
    generateTextMock.mockResolvedValue({ text: 'summary text' });

    service = new HuskyAiService(
      logger as any,
      cache as any,
      persistent as any,
      {} as any,
      { getTools: jest.fn().mockReturnValue({}) } as any,
      aiProvider as any
    );
  });

  it('resolves the model through the shared provider, pinned to Gemini without search grounding', async () => {
    streamTextMock.mockReturnValue({ textStream: chunks(['Hello']) });
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));

    await readAll(await service.createContextualToolsResponse(chatInfo, false));

    expect(aiProvider.getResponsesModel).toHaveBeenCalledWith(HUSKY_SEARCH_PROVIDER_ENV_VAR, {
      useSearchGrounding: false,
      fallbackProvider: HUSKY_SEARCH_FALLBACK_PROVIDER,
    });
    expect(HUSKY_SEARCH_FALLBACK_PROVIDER).toBe('gemini');
    expect(streamTextMock.mock.calls[0][0].model).toBe('model-handle');
    expect(streamObjectMock.mock.calls[0][0].model).toBe('model-handle');
  });

  it('streams one valid JSON object even when the answer contains quotes, backslashes and newlines', async () => {
    const answer = 'Example Team builds "storage" tools.\nSee C:\\path for details.';
    streamTextMock.mockReturnValue({ textStream: chunks([answer.slice(0, 20), answer.slice(20)]) });
    // Gemini may lead with whitespace and split the JSON arbitrarily across chunks.
    const json = JSON.stringify(STRUCTURED);
    streamObjectMock.mockReturnValue(structuredStream(['\n ', json.slice(0, 15), json.slice(15)]));

    const raw = await readAll(await service.createContextualToolsResponse(chatInfo, true));
    const parsed = HuskyResponseSchema.parse(JSON.parse(raw));

    expect(parsed.content).toBe(answer);
    expect(parsed.followUpQuestions).toEqual(STRUCTURED.followUpQuestions);
    expect(parsed.sources).toEqual(STRUCTURED.sources);
    expect(parsed.actions).toEqual(STRUCTURED.actions);

    await flushBackgroundWork();
    expect(persistent.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        threadId: 'thread-1',
        contextual: [
          expect.objectContaining({
            questionId: 'chat-1',
            question: chatInfo.question,
            response: answer,
            sources: STRUCTURED.sources,
            followUpQuestions: STRUCTURED.followUpQuestions,
            actions: STRUCTURED.actions,
          }),
        ],
      })
    );
    expect(cache.set).toHaveBeenCalledWith('thread-1:summary', 'summary text');
    expect(persistent.upsertByKeyValue).toHaveBeenCalledWith(
      expect.any(String),
      'threadId',
      'thread-1',
      expect.objectContaining({ summary: 'summary text' })
    );
  });

  it('keeps the streamed answer valid when the structured generation fails', async () => {
    streamTextMock.mockReturnValue({ textStream: chunks(['Just the answer']) });
    streamObjectMock.mockReturnValue({
      textStream: failingChunks([], new Error('schema mismatch')),
      object: Promise.reject(new Error('schema mismatch')),
    });

    const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));
    const parsed = HuskyResponseSchema.parse(JSON.parse(raw));

    expect(parsed).toEqual({ content: 'Just the answer', followUpQuestions: [], sources: [], actions: [] });
    expect(logger.error).toHaveBeenCalled();

    await flushBackgroundWork();
    expect(persistent.create).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        contextual: [expect.objectContaining({ response: 'Just the answer', sources: [], actions: [] })],
      })
    );
  });

  it('fails the stream when the answer generation itself fails, and persists nothing', async () => {
    streamTextMock.mockReturnValue({ textStream: failingChunks(['partial'], new Error('tool exploded')) });
    streamObjectMock.mockReturnValue(structuredStream(['{}']));

    await expect(readAll(await service.createContextualToolsResponse(chatInfo, false))).rejects.toThrow(
      'tool exploded'
    );

    await flushBackgroundWork();
    expect(streamObjectMock).not.toHaveBeenCalled();
    expect(persistent.create).not.toHaveBeenCalled();
    expect(generateTextMock).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('records a handed-over first exchange under its own chat id before answering', async () => {
    streamTextMock.mockReturnValue({ textStream: chunks(['Follow-up answer']) });
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));

    const handedOver = {
      user: 'Original blog question',
      system: 'Original blog answer',
      sources: ['https://blog.example.com'],
      followUpQuestions: [],
      actions: [],
      threadId: 'thread-1',
      chatId: 'chat-0',
    };
    await readAll(await service.createContextualToolsResponse({ ...chatInfo, chatSummary: handedOver }, false));
    await flushBackgroundWork();

    const persistedChatIds = persistent.create.mock.calls.map((call) => call[1].contextual[0].questionId);
    expect(persistedChatIds[0]).toBe('chat-0');
    expect(persistent.create.mock.calls[0][1].contextual[0]).toEqual(
      expect.objectContaining({ question: handedOver.user, response: handedOver.system, sources: handedOver.sources })
    );
    // The hand-over is summarised before the new question is sent to the model.
    expect(generateTextMock.mock.invocationCallOrder[0]).toBeLessThan(streamTextMock.mock.invocationCallOrder[0]);
  });
});

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
// demo-day.tool transitively imports DemoDaysService -> AnalyticsService -> posthog-node,
// which ships an untranspiled ESM axios build this jest config can't parse. This spec only
// needs HuskyAiService's own module graph to load; the tools service itself is a plain mock.
jest.mock('./tools/demo-day.tool', () => ({ DemoDayTool: jest.fn() }));
// irl-events.tool imports PLEventGuestsService/MembersService -> axios, same ESM problem.
jest.mock('./tools/irl-events.tool', () => ({ IrlEventsTool: jest.fn() }));

import { streamText, streamObject, generateText } from 'ai';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import {
  HuskyAiService,
  encodeJsonStringFragment,
  HUSKY_SEARCH_FALLBACK_PROVIDER,
  HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR,
  HUSKY_SEARCH_OPUS_MODEL_ENV_VAR,
  HUSKY_SEARCH_PROVIDER_ENV_VAR,
  HUSKY_SEARCH_STALL_TIMEOUT_ENV_VAR,
  HUSKY_SEARCH_STALLED_NOTICE,
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

/**
 * Yields `parts`, then goes silent the way a stalled provider connection does: the
 * iterator settles only when the SDK-style abort signal fires.
 */
async function* stallingChunks(parts: string[], abortSignal: AbortSignal) {
  for (const part of parts) {
    yield part;
  }
  await new Promise((_, reject) => {
    const fail = () => reject(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' }));
    if (abortSignal.aborted) fail();
    else abortSignal.addEventListener('abort', fail, { once: true });
  });
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

/** STRUCTURED.sources is not cited in the fixture answers, so it is appended. */
const UNCITED_SOURCE_REF = {
  index: 1,
  title: 'https://example.com/team',
  type: 'external' as const,
  externalUrl: 'https://example.com/team',
};

/** A streamText result: the answer chunks plus the finish reason the model reported. */
function answerStream(parts: string[], finishReason = 'stop') {
  return { textStream: chunks(parts), finishReason: Promise.resolve(finishReason) };
}

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
    findOneByKeyValue: jest.Mock;
    updateByKeyValue: jest.Mock;
  };
  let aiProvider: { getResponsesModel: jest.Mock };
  let logger: { error: jest.Mock; info: jest.Mock };
  let prisma: { member: { findUnique: jest.Mock } };
  let toolsService: { getTools: jest.Mock };
  let service: HuskyAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR];
    delete process.env[HUSKY_SEARCH_OPUS_MODEL_ENV_VAR];
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    persistent = {
      getDocByKeyValue: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      updateDocByKeyValue: jest.fn().mockResolvedValue(undefined),
      upsertByKeyValue: jest.fn().mockResolvedValue(undefined),
      findOneByKeyValue: jest.fn().mockResolvedValue({ threadId: 'thread-1' }),
      updateByKeyValue: jest.fn().mockResolvedValue(undefined),
    };
    aiProvider = { getResponsesModel: jest.fn().mockReturnValue('model-handle') };
    logger = { error: jest.fn(), info: jest.fn() };
    prisma = { member: { findUnique: jest.fn().mockResolvedValue(null) } };
    toolsService = { getTools: jest.fn().mockReturnValue({}) };
    generateTextMock.mockResolvedValue({ text: 'summary text' });

    service = new HuskyAiService(
      logger as any,
      cache as any,
      persistent as any,
      prisma as any,
      toolsService as any,
      aiProvider as any
    );
  });

  it('resolves the model through the shared provider, pinned to Gemini without search grounding', async () => {
    streamTextMock.mockReturnValue(answerStream(['Hello']));
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));

    await readAll(await service.createContextualToolsResponse(chatInfo, false));

    expect(aiProvider.getResponsesModel).toHaveBeenCalledWith(HUSKY_SEARCH_PROVIDER_ENV_VAR, {
      useSearchGrounding: false,
      fallbackProvider: HUSKY_SEARCH_FALLBACK_PROVIDER,
    });
    expect(HUSKY_SEARCH_FALLBACK_PROVIDER).toBe('gemini');
    expect(streamTextMock.mock.calls[0][0].model).toBe('model-handle');
    expect(streamTextMock.mock.calls[0][0].temperature).toBe(0.001);
    expect(streamObjectMock.mock.calls[0][0].model).toBe('model-handle');
    expect(streamObjectMock.mock.calls[0][0].temperature).toBe(0.001);
    expect(toolsService.getTools).toHaveBeenCalledWith({ isLoggedIn: false });
    expect(prisma.member.findUnique).not.toHaveBeenCalled();
  });

  it('uses Opus for the search stream when enabled, and leaves summaries and titles on the current provider', async () => {
    process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR] = 'True';
    aiProvider.getResponsesModel.mockReset();
    aiProvider.getResponsesModel.mockReturnValueOnce('opus-handle').mockReturnValue('current-handle');
    streamTextMock.mockReturnValue(answerStream(['Hello']));
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));
    await readAll(await service.createContextualToolsResponse(chatInfo, false));

    expect(aiProvider.getResponsesModel).toHaveBeenNthCalledWith(1, undefined, {
      useSearchGrounding: false,
      providerOverride: 'anthropic',
      modelOverride: 'claude-opus-5-5',
    });
    expect(streamTextMock.mock.calls[0][0].model).toBe('opus-handle');
    expect(streamTextMock.mock.calls[0][0].temperature).toBeUndefined();
    expect(streamObjectMock.mock.calls[0][0].model).toBe('opus-handle');
    expect(streamObjectMock.mock.calls[0][0].temperature).toBeUndefined();

    await flushBackgroundWork();
    expect(generateTextMock).toHaveBeenCalledWith(expect.objectContaining({ model: 'current-handle' }));
    expect(aiProvider.getResponsesModel).toHaveBeenNthCalledWith(2, HUSKY_SEARCH_PROVIDER_ENV_VAR, {
      useSearchGrounding: false,
      fallbackProvider: HUSKY_SEARCH_FALLBACK_PROVIDER,
    });

    await service.createThreadBasicInfo('thread-1', 'Name this thread');
    expect(generateTextMock).toHaveBeenLastCalledWith(expect.objectContaining({ model: 'current-handle' }));
    expect(aiProvider.getResponsesModel).toHaveBeenLastCalledWith(HUSKY_SEARCH_PROVIDER_ENV_VAR, {
      useSearchGrounding: false,
      fallbackProvider: HUSKY_SEARCH_FALLBACK_PROVIDER,
    });
  });

  it('honors HUSKY_SEARCH_OPUS_MODEL when Opus is enabled', async () => {
    process.env[HUSKY_SEARCH_OPUS_ENABLED_ENV_VAR] = 'true';
    process.env[HUSKY_SEARCH_OPUS_MODEL_ENV_VAR] = 'claude-opus-custom';
    streamTextMock.mockReturnValue(answerStream(['Hello']));
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));

    await readAll(await service.createContextualToolsResponse(chatInfo, false));

    expect(aiProvider.getResponsesModel).toHaveBeenCalledWith(undefined, {
      useSearchGrounding: false,
      providerOverride: 'anthropic',
      modelOverride: 'claude-opus-custom',
    });
  });

  it('streams a status line for each finished tool before the answer', async () => {
    streamTextMock.mockImplementation(({ onStepFinish }) => ({
      fullStream: (async function* () {
        yield { type: 'tool-call-streaming-start', toolCallId: 'c1', toolName: 'getMembers' };
        await onStepFinish({
          toolResults: [{ toolName: 'getMembers', result: 'Member ID: a\n\nMember ID: b' }],
        });
        yield { type: 'text-delta', textDelta: 'Hello' };
      })(),
      finishReason: Promise.resolve('stop'),
    }));
    streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));

    const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

    const searching = raw.indexOf('"Searching members"');
    const found = raw.indexOf('"Found 2 members"');
    const writing = raw.indexOf('"Writing the answer"');
    expect(searching).toBeGreaterThan(-1);
    expect(found).toBeGreaterThan(searching);
    expect(writing).toBeGreaterThan(found);
    expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('Hello');
  });

  it('streams one valid JSON object even when the answer contains quotes, backslashes and newlines', async () => {
    prisma.member.findUnique.mockResolvedValue({ uid: 'member-1', deletedAt: null });
    const answer = 'Example Team builds "storage" tools.\nSee C:\\path for details.';
    streamTextMock.mockReturnValue(answerStream([answer.slice(0, 20), answer.slice(20)]));
    // Gemini may lead with whitespace and split the JSON arbitrarily across chunks.
    const json = JSON.stringify(STRUCTURED);
    streamObjectMock.mockReturnValue(structuredStream(['\n ', json.slice(0, 15), json.slice(15)]));

    const raw = await readAll(await service.createContextualToolsResponse(chatInfo, true, 'member@example.com'));
    const parsed = HuskyResponseSchema.parse(JSON.parse(raw));

    expect(parsed.content).toBe(answer);
    expect(parsed.followUpQuestions).toEqual(STRUCTURED.followUpQuestions);
    expect(parsed.sources).toEqual(STRUCTURED.sources);
    expect(parsed.actions).toEqual(STRUCTURED.actions);
    expect(prisma.member.findUnique).toHaveBeenCalledWith({
      where: { email: 'member@example.com' },
      select: { uid: true, deletedAt: true },
    });
    expect(toolsService.getTools).toHaveBeenCalledWith({
      isLoggedIn: true,
      memberUid: 'member-1',
      email: 'member@example.com',
    });

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
            sourceRefs: [UNCITED_SOURCE_REF],
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
    streamTextMock.mockReturnValue(answerStream(['Just the answer']));
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

  describe('when the answer is cut off', () => {
    beforeEach(() => {
      process.env[HUSKY_SEARCH_STALL_TIMEOUT_ENV_VAR] = '20';
    });

    afterEach(() => {
      delete process.env[HUSKY_SEARCH_STALL_TIMEOUT_ENV_VAR];
    });

    it('continues a stalled answer from where it stopped, without tools, using the gathered context', async () => {
      streamTextMock
        .mockImplementationOnce(({ abortSignal, onStepFinish }) => {
          onStepFinish({ finishReason: 'tool-calls', toolResults: [{ result: 'news item A' }], text: '' });
          return { textStream: stallingChunks(['| Title |'], abortSignal), finishReason: new Promise(() => undefined) };
        })
        .mockReturnValueOnce(answerStream([' Event |\n| A | X |']));
      streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));
      const parsed = HuskyResponseSchema.parse(JSON.parse(raw));

      expect(parsed).toEqual({
        content: '| Title | Event |\n| A | X |',
        ...STRUCTURED,
        sourceRefs: [UNCITED_SOURCE_REF],
      });
      expect(streamTextMock).toHaveBeenCalledTimes(2);
      expect(streamTextMock.mock.calls[0][0].abortSignal.aborted).toBe(true);
      const continuation = streamTextMock.mock.calls[1][0];
      expect(continuation.tools).toBeUndefined();
      expect(continuation.prompt).toContain('partialAnswer: | Title |');
      expect(continuation.prompt).toContain('context: news item A');
      expect(streamObjectMock.mock.calls[0][0].prompt).toContain('content: | Title | Event |');
      expect(streamObjectMock.mock.calls[0][0].prompt).toContain('context: news item A');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cut off after 9 chars'));

      await flushBackgroundWork();
      expect(persistent.create).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          contextual: [expect.objectContaining({ response: '| Title | Event |\n| A | X |' })],
        })
      );
    });

    it('drops the part of the continuation that restates the end of the partial answer', async () => {
      const header = '| Title | Event Type |';
      streamTextMock
        .mockReturnValueOnce(answerStream([`## News\n\n${header}`], 'length'))
        .mockReturnValueOnce(answerStream(['| Title |', ' Event Type |\n|---|---|', '\n| A | LAUNCH |']));
      streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe(
        `## News\n\n${header}\n|---|---|\n| A | LAUNCH |`
      );
    });

    it('treats any finish reason other than stop as cut off and continues', async () => {
      streamTextMock
        .mockReturnValueOnce(answerStream(['Half of the'], 'content-filter'))
        .mockReturnValueOnce(answerStream([' answer.']));
      streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('Half of the answer.');
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('finish reason "content-filter"'));
    });

    it('starts over with tools when the stall happened before any text or tool result', async () => {
      streamTextMock
        .mockImplementationOnce(({ abortSignal }) => ({
          textStream: stallingChunks([], abortSignal),
          finishReason: new Promise(() => undefined),
        }))
        .mockReturnValueOnce(answerStream(['Fresh answer']));
      streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('Fresh answer');
      expect(streamTextMock.mock.calls[1][0].tools).toBeDefined();
      expect(streamTextMock.mock.calls[1][0].prompt).not.toContain('partialAnswer');
    });

    it('appends a notice and still closes the object when the continuation is cut off too', async () => {
      streamTextMock
        .mockImplementationOnce(({ abortSignal }) => ({
          textStream: stallingChunks(['partial'], abortSignal),
          finishReason: new Promise(() => undefined),
        }))
        .mockImplementationOnce(({ abortSignal }) => ({
          textStream: stallingChunks([' more'], abortSignal),
          finishReason: new Promise(() => undefined),
        }));
      streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw))).toEqual({
        content: `partial more${HUSKY_SEARCH_STALLED_NOTICE}`,
        ...STRUCTURED,
        sourceRefs: [UNCITED_SOURCE_REF],
      });
      expect(streamTextMock).toHaveBeenCalledTimes(2);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('cut off as well'));
    });

    it('closes the object with empty fields when the structured stream stalls before any JSON', async () => {
      streamTextMock.mockReturnValue(answerStream(['Full answer']));
      streamObjectMock.mockImplementation(({ abortSignal }) => ({
        textStream: stallingChunks([], abortSignal),
        object: new Promise(() => undefined),
      }));

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw))).toEqual({
        content: 'Full answer',
        followUpQuestions: [],
        sources: [],
        actions: [],
      });
      expect(streamObjectMock.mock.calls[0][0].abortSignal.aborted).toBe(true);
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('stalled'));
    });

    it('does not wait forever on an object promise that never settles after the stream ended', async () => {
      streamTextMock.mockReturnValue(answerStream(['Full answer']));
      streamObjectMock.mockReturnValue({
        textStream: chunks([]),
        object: new Promise(() => undefined),
      });

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw))).toEqual({
        content: 'Full answer',
        followUpQuestions: [],
        sources: [],
        actions: [],
      });
    });
  });

  it('records a handed-over first exchange under its own chat id before answering', async () => {
    streamTextMock.mockReturnValue(answerStream(['Follow-up answer']));
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

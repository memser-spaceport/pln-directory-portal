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
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
// irl-events.tool imports PLEventGuestsService/MembersService -> axios, same ESM problem.
jest.mock('./tools/irl-events.tool', () => ({ IrlEventsTool: jest.fn() }));
// The real tools service pulls in undici through its tool modules, and undici needs the web streams globals at import.
// This spec passes its own tools service mock to the constructor.
jest.mock('./tools/husky-ai-tools.serivice', () => ({ HuskyAiToolsService: jest.fn() }));

import { ForbiddenException } from '@nestjs/common';
import { streamText, streamObject, generateText } from 'ai';
import {
  HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT,
  HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT,
  HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT,
} from '../utils/ai-prompts';
import { AISDKError, APICallError, TypeValidationError } from '@ai-sdk/provider';
import { HuskyResponseSchema } from 'libs/contracts/src/schema/husky-chat';
import { answerCounts } from '../labos-agent/labos-agent-answer-counts';
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

  it('streams "Searching the web" for a web search and returns its cited pages as web sources', async () => {
    const webResult =
      'Web search results (public web, not directory data).\n\nSummary: Saturn Grid builds storage.\n\n' +
      'Web page: Saturn Grid - About [WebLink](https://saturngrid.example/about)';
    streamTextMock.mockImplementation(({ onStepFinish }) => ({
      fullStream: (async function* () {
        yield { type: 'tool-call-streaming-start', toolCallId: 'c1', toolName: 'searchWeb' };
        await onStepFinish({ toolResults: [{ toolName: 'searchWeb', result: webResult }] });
        yield {
          type: 'text-delta',
          textDelta: 'From the web: Saturn Grid builds storage [1](https://saturngrid.example/about).',
        };
      })(),
      finishReason: Promise.resolve('stop'),
    }));
    streamObjectMock.mockReturnValue(
      structuredStream(['{"followUpQuestions":[],"sources":["https://saturngrid.example/about"],"actions":[]}'])
    );

    const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

    expect(raw.indexOf('"Searching the web"')).toBeGreaterThan(-1);
    expect(raw.indexOf('"Found 1 web page"')).toBeGreaterThan(raw.indexOf('"Searching the web"'));
    const refs = HuskyResponseSchema.parse(JSON.parse(raw)).sourceRefs ?? [];
    expect(refs[0]).toEqual({
      index: 1,
      title: 'Saturn Grid - About',
      type: 'web',
      externalUrl: 'https://saturngrid.example/about',
    });
    expect(refs.filter((ref) => ref.type === 'web')).toHaveLength(1);
  });

  describe('text parts around tool calls (LAB-3362 D3)', () => {
    function partsTurn(parts: Array<{ type: string; [key: string]: unknown }>) {
      streamTextMock.mockImplementation(() => ({
        fullStream: (async function* () {
          for (const part of parts) yield part;
        })(),
        finishReason: Promise.resolve('stop'),
      }));
      streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));
    }
    const text = (textDelta: string) => ({ type: 'text-delta', textDelta });
    const call = (toolCallId: string) => ({ type: 'tool-call', toolCallId, toolName: 'get_my_profile' });

    it('joins the text before and after a tool call with a blank line', async () => {
      partsTurn([text('I will check your '), text('changes.'), call('c1'), text('Got your '), text('profile.')]);

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe(
        'I will check your changes.\n\nGot your profile.'
      );
    });

    it('adds no break inside one text part, before the first text, or for a part that has the break', async () => {
      partsTurn([
        call('c1'),
        text('One '),
        text('part.'),
        call('c2'),
        text('\n\nNext part.'),
        call('c3'),
        text('End.'),
      ]);

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('One part.\n\nNext part.\n\nEnd.');
    });

    it('puts one break after several tool calls in a row', async () => {
      partsTurn([text('Checking.'), call('c1'), call('c2'), text('Done.')]);

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('Checking.\n\nDone.');
    });
  });

  describe('turnFields (LAB-3297)', () => {
    function twoToolTurn() {
      streamTextMock.mockImplementation(({ onStepFinish }) => ({
        fullStream: (async function* () {
          yield { type: 'tool-call', toolCallId: 'c1', toolName: 'searchWeb' };
          yield { type: 'tool-call', toolCallId: 'c2', toolName: 'getMembers' };
          await onStepFinish({
            toolCalls: [{ toolName: 'searchWeb' }, { toolName: 'getMembers' }],
            toolResults: [{ toolName: 'searchWeb', result: 'Web search not available' }],
          });
          yield { type: 'text-delta', textDelta: 'Answer' };
        })(),
        finishReason: Promise.resolve('stop'),
      }));
      streamObjectMock.mockReturnValue(structuredStream(['{}']));
    }

    it('gives the tool calls of the turn and the tail sources to turnFields, and adds its fields to the tail', async () => {
      twoToolTurn();
      const turnFields = jest.fn().mockReturnValue({ toolCount: 2 });

      const raw = await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, {
          extraResponseFields: { proposals: [] },
          turnFields,
        })
      );

      expect(turnFields).toHaveBeenCalledTimes(1);
      expect(turnFields).toHaveBeenCalledWith({
        toolNames: ['searchWeb', 'getMembers'],
        sources: STRUCTURED.sources,
        sourceRefs: [UNCITED_SOURCE_REF],
      });
      const body = JSON.parse(raw);
      expect(body.toolCount).toBe(2);
      expect(body.proposals).toEqual([]);
    });

    it('LAB-3362 D2: lets a turn field replace a tail field with the same key, also in the counts input', async () => {
      twoToolTurn();
      const turnFields = jest.fn((turn) => ({ sources: [], sourceCount: turn.sources.length }));

      const body = JSON.parse(
        await readAll(await service.createContextualToolsResponse(chatInfo, false, undefined, { turnFields }))
      );

      expect(body.sources).toEqual([]);
      expect(body.sourceCount).toBe(STRUCTURED.sources.length);
      expect(body.followUpQuestions).toEqual(STRUCTURED.followUpQuestions);
    });

    it('adds the turn fields when the structured tail fails too', async () => {
      twoToolTurn();
      streamObjectMock.mockReturnValue(structuredStream([], Promise.reject(new Error('tail failed'))));

      const raw = await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, {
          turnFields: (turn) => ({ toolCount: turn.toolNames.length }),
        })
      );

      expect(JSON.parse(raw).toolCount).toBe(2);
    });

    it('keeps the AI search body unchanged when no turnFields is given', async () => {
      twoToolTurn();

      const body = JSON.parse(await readAll(await service.createContextualToolsResponse(chatInfo, false)));

      expect(Object.keys(body).sort()).toEqual(
        ['actions', 'content', 'followUpQuestions', 'sourceRefs', 'sources', 'steps'].sort()
      );
    });
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

  describe('error logs (LAB-3362, contract 11.4)', () => {
    // LAB-3362 (Oleg 1795251083.950879): bad draft_intro args put the model input into the error message.
    const SECRET = 'Secret-draft-5e1f: I lead fundraising at Acme and want your advice soon.';
    // As `InvalidToolArgumentsError` in ai 4.0.19 (dist/index.js): the cause message, with the args, is in `message`.
    const invalidDraftArgs = (): Error => {
      const args = { type: 'person', targetUid: 'm-grace', text: SECRET };
      const cause = new TypeValidationError({ value: args, cause: new Error('Invalid enum value') });
      return Object.assign(
        new AISDKError({
          name: 'AI_InvalidToolArgumentsError',
          message: `Invalid arguments for tool draft_intro: ${cause.message}`,
          cause,
        }),
        { toolName: 'draft_intro', toolArgs: JSON.stringify(args) }
      ) as unknown as Error;
    };
    const draftTool = { draft_intro: { description: 'draft', parameters: {} } as any };

    it('logs only name and toolName for an invalid tool args error part in the answer stream', async () => {
      streamTextMock.mockImplementation(() => ({
        fullStream: (async function* () {
          yield { type: 'error', error: invalidDraftArgs() };
          yield { type: 'text-delta', textDelta: 'I could not make the draft.' };
        })(),
        finishReason: Promise.resolve('stop'),
      }));
      streamObjectMock.mockReturnValue(structuredStream(['{}']));

      await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, {
          persistHistory: false,
          extraTools: draftTool,
        })
      );
      await flushBackgroundWork();

      expect(logger.error).toHaveBeenCalledWith(
        'Husky answer stream provider error: {"name":"AI_InvalidToolArgumentsError","toolName":"draft_intro"}'
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Secret-draft-5e1f');
    });

    it('logs only name and toolName when the answer stream throws an invalid tool args error', async () => {
      streamTextMock.mockReturnValue({ textStream: failingChunks([], invalidDraftArgs()) });

      await expect(
        readAll(
          await service.createContextualToolsResponse(chatInfo, false, undefined, {
            persistHistory: false,
            extraTools: draftTool,
          })
        )
      ).rejects.toThrow('Invalid arguments for tool draft_intro');
      await flushBackgroundWork();

      expect(logger.error).toHaveBeenCalledWith(
        'Husky search failed for thread thread-1, chat chat-1: {"name":"AI_InvalidToolArgumentsError","toolName":"draft_intro"}'
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Secret-draft-5e1f');
    });

    const CARD_TEXT = 'Card-text-91bd: I lead fundraising at Acme and want your advice.';
    const promptContext = `Its current text, with the edits of the member: ${JSON.stringify(CARD_TEXT)}.`;
    // As the AI SDK does: the error keeps the whole request body, with the prompt.
    const apiError = (statusCode: number, prompt: unknown) =>
      new APICallError({
        message: statusCode === 529 ? 'Overloaded' : 'Rate limit',
        url: 'https://api.example.com/v1/messages',
        requestBodyValues: { prompt },
        statusCode,
        responseBody: '{"type":"error"}',
      }) as unknown as Error;
    const logged = () =>
      JSON.stringify(logger.error.mock.calls, (_key, value) =>
        value instanceof Error ? { ...value, message: value.message, stack: value.stack } : value
      );

    it('logs only name, statusCode and message when the structured tail and the summary fail with an APICallError', async () => {
      streamTextMock.mockReturnValue(answerStream(['Here is a draft intro.']));
      streamObjectMock.mockImplementation((args: { prompt: string }) => {
        const error = apiError(529, args.prompt);
        const object = Promise.reject(error);
        object.catch(() => undefined);
        return { textStream: failingChunks([], error), object };
      });
      generateTextMock.mockImplementation(async (args: unknown) => {
        throw apiError(429, args);
      });

      const raw = await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, {
          promptContext,
          persistHistory: false,
        })
      );
      await flushBackgroundWork();

      expect(streamObjectMock.mock.calls[0][0].prompt).toContain('Card-text-91bd');
      expect(JSON.parse(raw).content).toBe('Here is a draft intro.');
      expect(logger.error).toHaveBeenCalledWith(
        'Husky structured response generation failed: {"name":"AI_APICallError","statusCode":529,"message":"Overloaded"}'
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Failed to update chat summary for thread thread-1: {"name":"AI_APICallError","statusCode":429,"message":"Rate limit"}'
      );
      expect(logged()).not.toContain('Card-text-91bd');
      expect(logged()).not.toContain('requestBodyValues');
    });

    it('logs only name, statusCode and message when the answer stream fails with an APICallError', async () => {
      streamTextMock.mockImplementation((args: { prompt?: string; messages?: unknown; system?: string }) => ({
        textStream: failingChunks([], apiError(529, args)),
      }));

      await expect(
        readAll(await service.createContextualToolsResponse(chatInfo, false, undefined, { promptContext }))
      ).rejects.toThrow('Overloaded');
      await flushBackgroundWork();

      expect(logger.error).toHaveBeenCalledWith(
        'Husky search failed for thread thread-1, chat chat-1: {"name":"AI_APICallError","statusCode":529,"message":"Overloaded"}'
      );
      expect(logged()).not.toContain('Card-text-91bd');
    });

    it('logs only name, statusCode and message when the history write fails', async () => {
      streamTextMock.mockReturnValue(answerStream(['Just the answer']));
      streamObjectMock.mockReturnValue(structuredStream(['{}']));
      persistent.create.mockRejectedValue(Object.assign(new Error('write failed'), { args: { response: CARD_TEXT } }));

      await readAll(await service.createContextualToolsResponse(chatInfo, false, undefined, { promptContext }));
      await flushBackgroundWork();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to persist chat history for thread thread-1: {"name":"Error","message":"write failed"}'
      );
      expect(logged()).not.toContain('Card-text-91bd');
    });
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

    describe('answer counts (LAB-3297)', () => {
      const WEB_RESULT =
        'Web search results (public web, not directory data).\n\nSummary: Example Team builds storage.\n\n' +
        'Web page: Example Team [WebLink](https://example.com/team)';
      const searchWebStep = {
        finishReason: 'tool-calls',
        toolCalls: [{ toolName: 'searchWeb' }],
        toolResults: [{ toolName: 'searchWeb', result: WEB_RESULT }],
        text: '',
      };
      const tail = async () =>
        JSON.parse(
          await readAll(
            await service.createContextualToolsResponse(chatInfo, false, undefined, { turnFields: answerCounts })
          )
        );

      it('adds the tool calls of the continuation to the calls before the cut', async () => {
        streamTextMock
          .mockImplementationOnce(({ onStepFinish }) => {
            onStepFinish(searchWebStep);
            return answerStream(['Half of the'], 'length');
          })
          .mockImplementationOnce(({ onStepFinish }) => {
            onStepFinish({
              toolCalls: [{ toolName: 'getMembers' }],
              toolResults: [{ toolName: 'getMembers', result: '' }],
            });
            return answerStream([' answer.']);
          });
        streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

        const body = await tail();

        expect(streamTextMock.mock.calls[1][0].prompt).toContain('partialAnswer: Half of the');
        expect(body.content).toBe('Half of the answer.');
        expect(body).toEqual(expect.objectContaining({ toolCount: 2, usedWebSearch: true, sourceCount: 1 }));
      });

      it('counts the calls of a continuation with no tool call: the calls before the cut only', async () => {
        streamTextMock
          .mockImplementationOnce(({ onStepFinish }) => {
            onStepFinish(searchWebStep);
            return answerStream(['Half of the'], 'length');
          })
          .mockReturnValueOnce(answerStream([' answer.']));
        streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

        expect(await tail()).toEqual(expect.objectContaining({ toolCount: 1, usedWebSearch: true, sourceCount: 1 }));
      });

      it('counts the web search of a restart with tools after a stall before any text', async () => {
        streamTextMock
          .mockImplementationOnce(({ abortSignal }) => ({
            textStream: stallingChunks([], abortSignal),
            finishReason: new Promise(() => undefined),
          }))
          .mockImplementationOnce(({ onStepFinish }) => {
            onStepFinish(searchWebStep);
            return answerStream(['Fresh answer']);
          });
        streamObjectMock.mockReturnValue(structuredStream([JSON.stringify(STRUCTURED)]));

        const body = await tail();

        expect(streamTextMock.mock.calls[1][0].tools).toBeDefined();
        expect(body).toEqual(expect.objectContaining({ toolCount: 1, usedWebSearch: true, sourceCount: 1 }));
      });

      it('sends the counts in the final chunk of a stalled answer', async () => {
        streamTextMock
          .mockImplementationOnce(({ abortSignal, onStepFinish }) => {
            onStepFinish(searchWebStep);
            onStepFinish({
              toolCalls: [{ toolName: 'list_news' }],
              toolResults: [{ toolName: 'list_news', result: '' }],
            });
            return { textStream: stallingChunks(['partial'], abortSignal), finishReason: new Promise(() => undefined) };
          })
          .mockImplementationOnce(({ abortSignal }) => ({
            textStream: stallingChunks([' more'], abortSignal),
            finishReason: new Promise(() => undefined),
          }));
        streamObjectMock.mockReturnValue(
          structuredStream(
            [],
            Promise.resolve({ ...STRUCTURED, sources: [...STRUCTURED.sources, 'https://b.example'] })
          )
        );

        const body = await tail();

        expect(body.content).toBe(`partial more${HUSKY_SEARCH_STALLED_NOTICE}`);
        expect(body).toEqual(expect.objectContaining({ toolCount: 2, usedWebSearch: true, sourceCount: 2 }));
      });

      it('sends the counts of a stalled answer when the structured tail stalls too', async () => {
        streamTextMock
          .mockImplementationOnce(({ abortSignal, onStepFinish }) => {
            onStepFinish(searchWebStep);
            return { textStream: stallingChunks(['partial'], abortSignal), finishReason: new Promise(() => undefined) };
          })
          .mockImplementationOnce(({ abortSignal }) => ({
            textStream: stallingChunks([' more'], abortSignal),
            finishReason: new Promise(() => undefined),
          }));
        streamObjectMock.mockImplementation(({ abortSignal }) => ({
          textStream: stallingChunks([], abortSignal),
          object: new Promise(() => undefined),
        }));

        const body = await tail();

        // The tail is empty and the answer cites no page, so the turn has no source.
        expect(body.sources).toEqual([]);
        expect(body.sourceRefs).toBeUndefined();
        expect(body).toEqual(expect.objectContaining({ toolCount: 1, usedWebSearch: true, sourceCount: 0 }));
      });
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

  describe('answerLine (LAB-3362 D4)', () => {
    const LINE = 'Here is a draft. Edit it in the card.';
    const text = (textDelta: string) => ({ type: 'text-delta', textDelta });
    const call = (toolCallId: string) => ({ type: 'tool-call', toolCallId, toolName: 'draft_intro' });

    /** One answer generation. A `set` item changes the answer line, as a tool call that adds or removes a draft. */
    function lineTurn(
      items: Array<{ type: string; [key: string]: unknown } | { set: boolean }>,
      finishReason = 'stop'
    ) {
      let on = false;
      streamTextMock.mockImplementation(() => ({
        fullStream: (async function* () {
          for (const item of items) {
            if ('set' in item) on = item.set as boolean;
            else yield item;
          }
        })(),
        finishReason: Promise.resolve(finishReason),
      }));
      streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));
      return () => (on ? LINE : undefined);
    }

    async function content(answerLine: () => string | undefined) {
      const raw = await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, { answerLine })
      );
      return HuskyResponseSchema.parse(JSON.parse(raw)).content;
    }

    it('shows the line once, at the end, in place of the model text after the tool call', async () => {
      const answerLine = lineTurn([
        text('I will write it.'),
        call('c1'),
        { set: true },
        text('Hi Grace, I lead '),
        text('fundraising at Acme.'),
      ]);

      expect(await content(answerLine)).toBe(`I will write it.\n\n${LINE}`);
    });

    it('adds the line at the end when the model writes no text after the tool call', async () => {
      expect(await content(lineTurn([call('c1'), { set: true }]))).toBe(LINE);
    });

    it('shows no line when a later call removes the draft, and streams the model text again', async () => {
      const answerLine = lineTurn([
        call('c1'),
        { set: true },
        text('Hi Grace.'),
        call('c2'),
        { set: false },
        // Starts with its own break, so the result is the same with and without the D3 text part break.
        text('\n\nThe draft was refused.'),
      ]);

      // No draft card goes out, so the answer has no "Here is a draft" line.
      expect(await content(answerLine)).toBe('The draft was refused.');
    });

    it('keeps the earlier answer text and its break when a later call removes the draft', async () => {
      const answerLine = lineTurn([
        text('I will write it.'),
        call('c1'),
        { set: true },
        text('Hi Grace.'),
        call('c2'),
        { set: false },
        text('\n\nThe draft was refused.'),
      ]);

      expect(await content(answerLine)).toBe('I will write it.\n\nThe draft was refused.');
    });

    it('shows the line at the end when a refused call is followed by a valid draft', async () => {
      const answerLine = lineTurn([
        call('c1'),
        { set: false },
        text('That was refused. I try again.'),
        call('c2'),
        { set: true },
        text('Hi Grace.'),
      ]);

      expect(await content(answerLine)).toBe(`That was refused. I try again.\n\n${LINE}`);
    });

    it('does not continue a cut-off answer while the line is on', async () => {
      const answerLine = lineTurn([call('c1'), { set: true }, text('Hi Grace, I')], 'length');

      expect(await content(answerLine)).toBe(LINE);
      expect(streamTextMock).toHaveBeenCalledTimes(1);
    });

    it('keeps the model text when the caller passes no line (AI search)', async () => {
      lineTurn([text('One answer.')]);

      const raw = await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(HuskyResponseSchema.parse(JSON.parse(raw)).content).toBe('One answer.');
    });
  });

  describe('answerInstructions (LAB-3367 k2, k7)', () => {
    const RULES = '## Caller rules\n- A fixed rule.';
    const TAIL = '{"followUpQuestions":[],"sources":[],"actions":[]}';

    beforeEach(() => {
      cache.get.mockResolvedValue(null);
      streamObjectMock.mockImplementation(() => structuredStream([TAIL]));
    });

    it('adds the text to the end of the system message of the answer call and the continuation, not of the tail', async () => {
      streamTextMock
        .mockReturnValueOnce(answerStream(['Half'], 'length'))
        .mockReturnValueOnce(answerStream([' and the rest.']));

      await readAll(
        await service.createContextualToolsResponse(chatInfo, false, undefined, {
          answerInstructions: RULES,
          promptContext: 'Page text.',
        })
      );

      expect(streamTextMock).toHaveBeenCalledTimes(2);
      expect(streamTextMock.mock.calls[0][0].system).toBe(`${HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT}\n\n${RULES}`);
      expect(streamTextMock.mock.calls[1][0].system).toBe(`${HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT}\n\n${RULES}`);
      // Not in the user prompt of any call, and not in the structured tail.
      for (const call of streamTextMock.mock.calls) expect(call[0].prompt).not.toContain('A fixed rule.');
      const tail = streamObjectMock.mock.calls[0][0];
      expect(tail.system).toBe(HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT);
      expect(tail.prompt).not.toContain('A fixed rule.');
      // The page context still goes to every call, as before.
      expect(tail.prompt).toContain('Page text.');
    });

    it('AI search passes nothing: the shared system messages do not change', async () => {
      streamTextMock
        .mockReturnValueOnce(answerStream(['Half'], 'length'))
        .mockReturnValueOnce(answerStream([' and the rest.']));

      await readAll(await service.createContextualToolsResponse(chatInfo, false));

      expect(streamTextMock.mock.calls[0][0].system).toBe(HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT);
      expect(streamTextMock.mock.calls[1][0].system).toBe(HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT);
      expect(streamObjectMock.mock.calls[0][0].system).toBe(HUSKY_CONTEXTUAL_TOOLS_STRUCTURED_PROMPT);
    });
  });

  describe('latestReplyKey (LAB-3367 h3)', () => {
    const KEY = 'labos-agent:latest-reply:["m-1","thread-1"]';
    const LINE = 'Here is a draft intro. Edit it in the card, then send.';
    const TAIL = '{"followUpQuestions":[],"sources":[],"actions":[]}';
    let store: Map<string, unknown>;

    beforeEach(() => {
      store = new Map();
      cache.get.mockImplementation(async (key: string) => (store.has(key) ? store.get(key) : null));
      cache.set.mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
      });
      streamObjectMock.mockImplementation(() => structuredStream([TAIL]));
    });

    const turn = Object.assign(
      (options: Record<string, unknown> = {}) =>
        service
          .createContextualToolsResponse(chatInfo, false, undefined, { latestReplyKey: KEY, ...options })
          .then(readAll),
      {
        /** The open stream of one turn, for a test that reads or cancels it itself. */
        stream: (options: Record<string, unknown> = {}) =>
          service.createContextualToolsResponse(chatInfo, false, undefined, { latestReplyKey: KEY, ...options }),
      }
    );
    const answerPrompt = (call: number) => streamTextMock.mock.calls[call][0].prompt as string;

    it('AI search passes no key: no read, no write and no latestReply line', async () => {
      streamTextMock.mockReturnValue(answerStream(['One answer.']));
      await readAll(await service.createContextualToolsResponse(chatInfo, false));
      await flushBackgroundWork();

      const keys = [...cache.get.mock.calls, ...cache.set.mock.calls].map((call) => call[0]);
      expect(keys.every((key) => key === 'thread-1:summary')).toBe(true);
      expect(answerPrompt(0)).not.toContain('latestReply');
      expect(answerPrompt(0)).not.toContain('Previous reply');
    });

    it('writes the reply before the stream closes, so an immediate follow-up reads it before the summary', async () => {
      // The summary model never answers, so the summary key is never written.
      generateTextMock.mockReturnValue(new Promise(() => undefined));
      streamTextMock.mockReturnValueOnce(answerStream(['First "answer".'])).mockReturnValueOnce(answerStream(['Ok.']));

      await turn();
      // readAll returns when the client sees the end of the stream. The value is already there.
      expect(store.get(KEY)).toBe('First "answer".');
      await turn();

      expect(store.has('thread-1:summary')).toBe(false);
      expect(answerPrompt(1)).toContain(`Previous reply: ${JSON.stringify('First "answer".')}`);
      expect(answerPrompt(1)).not.toContain('chatHistory');
    });

    it('LAB-3367 F3: a stored reply is JSON text, so a reply "unknown" differs from the unknown marker', async () => {
      store.set(KEY, 'unknown');
      streamTextMock.mockReturnValueOnce(answerStream(['Next.']));
      await turn();
      expect(answerPrompt(0)).toContain('Previous reply: "unknown"');
    });

    it('a follow-up after the summary gets the chat history and latestReply', async () => {
      streamTextMock.mockReturnValueOnce(answerStream(['First answer.'])).mockReturnValueOnce(answerStream(['Ok.']));

      await turn();
      await flushBackgroundWork();
      await turn();

      expect(answerPrompt(1)).toContain('chatHistory: summary text');
      expect(answerPrompt(1)).toContain('Previous reply: "First answer."');
      // The structured tail call does not get latestReply.
      expect(streamObjectMock.mock.calls[1][0].prompt).not.toContain('latestReply');
      expect(streamObjectMock.mock.calls[1][0].prompt).not.toContain('Previous reply');
      expect(streamObjectMock.mock.calls[1][0].prompt).not.toContain('First answer."');
    });

    it('a draft turn stores only the answer line, and the next normal turn replaces it', async () => {
      let on = false;
      streamTextMock
        .mockImplementationOnce(() => ({
          fullStream: (async function* () {
            yield { type: 'text-delta', textDelta: 'I will write it.' };
            yield { type: 'tool-call', toolCallId: 'c1', toolName: 'draft_intro' };
            on = true;
            yield { type: 'text-delta', textDelta: 'Hi Grace, Draft-text-91c2.' };
          })(),
          finishReason: Promise.resolve('stop'),
        }))
        .mockReturnValueOnce(answerStream(['A normal answer.']))
        .mockReturnValueOnce(answerStream(['Ok.']));
      const answerLine = () => (on ? LINE : undefined);

      await turn({ answerLine });
      expect(store.get(KEY)).toBe(LINE);
      on = false;
      await turn({ answerLine });
      expect(answerPrompt(1)).toContain(`Previous reply: ${JSON.stringify(LINE)}`);
      expect(store.get(KEY)).toBe('A normal answer.');
      await turn({ answerLine });

      expect(answerPrompt(2)).toContain('Previous reply: "A normal answer."');
      expect(JSON.stringify(cache.set.mock.calls)).not.toContain('Draft-text-91c2');
    });

    describe('LAB-3367 F1, F3, K3: latestReplyTurn and reservedReply', () => {
      const tools = (names: string[]) => Object.fromEntries(names.map((name) => [name, { description: name }]));

      it('gets the latest reply once and replaces the prompt context, the tools and the answer line for the turn', async () => {
        store.set(KEY, 'A normal answer.');
        streamTextMock.mockReturnValueOnce(answerStream(['Shorter.']));
        const latestReplyTurn = jest.fn(() => ({
          promptContext: 'Page only.',
          extraTools: tools(['list_news']),
          answerLine: undefined,
        }));

        const body = await turn({
          promptContext: 'Page only.\nCard-text-7f3a',
          extraTools: tools(['list_news', 'draft_intro']),
          answerLine: () => LINE,
          latestReplyTurn,
        });

        expect(latestReplyTurn).toHaveBeenCalledTimes(1);
        expect(latestReplyTurn).toHaveBeenCalledWith('A normal answer.');
        const call = streamTextMock.mock.calls[0][0];
        expect(call.tools).toHaveProperty('list_news');
        expect(call.tools).not.toHaveProperty('draft_intro');
        expect(call.prompt).toContain('pageContext: Page only.');
        expect(call.prompt).not.toContain('Card-text-7f3a');
        expect(streamObjectMock.mock.calls[0][0].prompt).not.toContain('Card-text-7f3a');
        // No answer line for the turn: the model text streams, and the store has that text.
        expect(body).toContain('Shorter.');
        expect(body).not.toContain(LINE);
        expect(store.get(KEY)).toBe('Shorter.');
      });

      it('o1: the retry after an empty cut-off answer keeps the tools and the prompt context of the turn', async () => {
        store.set(KEY, 'A normal answer.');
        // Nothing streamed and no tool result: the stream starts the answer again, with tools.
        streamTextMock.mockReturnValueOnce(answerStream([], 'length')).mockReturnValueOnce(answerStream(['Shorter.']));
        await turn({
          promptContext: 'Page only.\nCard-text-7f3a',
          extraTools: tools(['list_news', 'draft_intro']),
          latestReplyTurn: () => ({ promptContext: 'Page only.', extraTools: tools(['list_news']) }),
        });

        expect(streamTextMock).toHaveBeenCalledTimes(2);
        for (const [call] of streamTextMock.mock.calls) {
          expect(call.tools).toHaveProperty('list_news');
          expect(call.tools).not.toHaveProperty('draft_intro');
          expect(JSON.stringify(call)).not.toContain('Card-text-7f3a');
        }
      });

      it('an empty result keeps the options of the caller', async () => {
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.']));
        const latestReplyTurn = jest.fn(() => ({}));
        await turn({ extraTools: tools(['draft_intro']), latestReplyTurn });
        // No stored reply: the caller gets ''.
        expect(latestReplyTurn).toHaveBeenCalledWith('');
        expect(streamTextMock.mock.calls[0][0].tools).toHaveProperty('draft_intro');
      });

      it('a fixed answer runs no model call and no tool, keeps the C1 body fields and is stored', async () => {
        const turnFields = jest.fn<Record<string, unknown>, [{ toolNames: string[] }]>(() => ({ toolCount: 0 }));
        const body = await turn({
          extraTools: tools(['draft_intro']),
          extraResponseFields: { proposals: [], drafts: [] },
          turnFields,
          latestReplyTurn: () => ({ fixedAnswer: 'Which reply?' }),
        });

        await flushBackgroundWork();
        expect(streamTextMock).not.toHaveBeenCalled();
        expect(streamObjectMock).not.toHaveBeenCalled();
        // No summary model call, and the earlier summary stays.
        expect(generateTextMock).not.toHaveBeenCalled();
        expect(cache.set.mock.calls.map((call) => call[0])).not.toContain('thread-1:summary');
        const parsed = JSON.parse(body);
        expect(parsed.content).toBe('Which reply?');
        expect(parsed).toMatchObject({
          followUpQuestions: [],
          sources: [],
          actions: [],
          proposals: [],
          drafts: [],
          toolCount: 0,
        });
        expect(turnFields.mock.calls[0][0]).toMatchObject({ toolNames: [] });
        expect(store.get(KEY)).toBe('Which reply?');
      });

      it('G1: the answer rules of latestReplyTurn win in the answer call and the continuation', async () => {
        store.set(KEY, 'A normal answer.');
        streamTextMock
          .mockReturnValueOnce(answerStream(['Half'], 'length'))
          .mockReturnValueOnce(answerStream([' and the rest.']));
        await turn({
          answerInstructions: 'Default rules.',
          latestReplyTurn: () => ({ answerInstructions: 'Turn rules.' }),
        });
        expect(streamTextMock).toHaveBeenCalledTimes(2);
        expect(streamTextMock.mock.calls[0][0].system).toBe(`${HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT}\n\nTurn rules.`);
        expect(streamTextMock.mock.calls[1][0].system).toBe(
          `${HUSKY_CONTEXTUAL_TOOLS_CONTINUATION_PROMPT}\n\nTurn rules.`
        );
      });

      it('G1: with no turn rules, the default rules stay', async () => {
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.']));
        await turn({ answerInstructions: 'Default rules.', latestReplyTurn: () => ({}) });
        expect(streamTextMock.mock.calls[0][0].system).toBe(
          `${HUSKY_CONTEXTUAL_TOOLS_SYSTEM_PROMPT}\n\nDefault rules.`
        );
      });

      it('w1: omitHistory sends no chat history to the answer, the continuation or the tail', async () => {
        store.set('thread-1:summary', 'The member asked for a Gitcoin intro draft.');
        streamTextMock
          .mockReturnValueOnce(answerStream(['Half'], 'length'))
          .mockReturnValueOnce(answerStream([' and the rest.']));
        await turn({ latestReplyTurn: () => ({ omitLatestReply: true, omitHistory: true }) });
        expect(streamTextMock).toHaveBeenCalledTimes(2);
        for (const [call] of [...streamTextMock.mock.calls, ...streamObjectMock.mock.calls]) {
          expect(JSON.stringify(call)).not.toContain('Gitcoin');
          expect(JSON.stringify(call)).not.toContain('chatHistory');
        }
        expect(streamObjectMock).toHaveBeenCalledTimes(1);
      });

      it('w1: with no omitHistory, the chat history stays in the answer and the tail', async () => {
        store.set('thread-1:summary', 'The member asked for a Gitcoin intro draft.');
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.']));
        await turn({ latestReplyTurn: () => ({}) });
        expect(answerPrompt(0)).toContain('chatHistory: The member asked for a Gitcoin intro draft.');
        expect(JSON.stringify(streamObjectMock.mock.calls[0][0])).toContain('Gitcoin');
      });

      it('G7: omitLatestReply sends no Previous reply line, and the turn still stores its reply', async () => {
        streamTextMock.mockReturnValueOnce(answerStream(['New answer.']));
        await turn({ latestReplyTurn: () => ({ omitLatestReply: true }) });
        expect(answerPrompt(0)).not.toContain('Previous reply');
        expect(store.get(KEY)).toBe('New answer.');
      });

      it('G3: the stored reserved line goes to the prompt as the bare label, other replies stay quoted', async () => {
        store.set(KEY, LINE);
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.'])).mockReturnValueOnce(answerStream(['Ok 2.']));
        await turn({ reservedReply: LINE, reservedReplyLabel: 'an intro draft card' });
        expect(answerPrompt(0)).toContain('Previous reply: an intro draft card');
        expect(answerPrompt(0)).not.toContain(LINE);
        await turn({ reservedReply: LINE, reservedReplyLabel: 'an intro draft card' });
        expect(answerPrompt(1)).toContain('Previous reply: "Ok."');
      });

      it('G3: with no label (AI search and older callers), the reserved line stays quoted', async () => {
        store.set(KEY, LINE);
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.']));
        await turn({ reservedReply: LINE });
        expect(answerPrompt(0)).toContain(`Previous reply: ${JSON.stringify(LINE)}`);
      });

      it('model text that is only the reserved line is stored as not known', async () => {
        streamTextMock.mockReturnValueOnce(answerStream([` ${LINE}\n`])).mockReturnValueOnce(answerStream(['Ok.']));
        await turn({ reservedReply: LINE });
        expect(store.get(KEY)).toBe('');
        await turn({ reservedReply: LINE });
        expect(answerPrompt(1)).toContain('Previous reply: not available');
      });

      it('F6: with no answer line, the stream removes the reserved line from the model text, also across chunks', async () => {
        const half = Math.floor(LINE.length / 2);
        streamTextMock.mockReturnValueOnce(
          answerStream(['Shorter answer.\n\n', LINE.slice(0, half), LINE.slice(half), ' Done.'])
        );
        const body = await turn({ reservedReply: LINE });
        const parsed = JSON.parse(body);
        expect(body).not.toContain(LINE);
        expect(parsed.content).toBe('Shorter answer.\n\n Done.');
        expect(store.get(KEY)).toBe('Shorter answer.\n\n Done.');
      });

      it('F6: the reserved line split across a cut-off answer and its continuation is removed', async () => {
        const half = Math.floor(LINE.length / 2);
        streamTextMock
          .mockReturnValueOnce(answerStream(['Shorter answer.\n\n', LINE.slice(0, half)], 'length'))
          .mockReturnValueOnce(answerStream([LINE.slice(half), ' Done.']));
        const body = await turn({ reservedReply: LINE });
        expect(streamTextMock).toHaveBeenCalledTimes(2);
        expect(body).not.toContain(LINE);
        expect(JSON.parse(body).content).toBe('Shorter answer.\n\n Done.');
      });

      it('F6: a held start of the line streams before the stalled notice', async () => {
        const start = LINE.slice(0, 8);
        streamTextMock
          .mockReturnValueOnce(answerStream([`A. ${start}`], 'length'))
          .mockReturnValueOnce(answerStream([], 'length'));
        const body = await turn({ reservedReply: LINE });
        expect(JSON.parse(body).content).toBe(`A. ${start}${HUSKY_SEARCH_STALLED_NOTICE}`);
      });

      const EMPTY = 'I did not change anything. Please say it again in other words.';

      it('t1: a turn whose text is only the reserved line gets the empty-reply line and stores not known', async () => {
        streamTextMock.mockReturnValueOnce(answerStream([` ${LINE}\n`]));
        const body = await turn({ reservedReply: LINE, emptyReplyLine: EMPTY });
        expect(JSON.parse(body).content.trim()).toBe(EMPTY);
        expect(body).not.toContain(LINE);
        expect(store.get(KEY)).toBe('');
      });

      it('t1: a refused draft (answer line off again) with only the line also gets the empty-reply line', async () => {
        // The first chunk comes while a draft is on. Then the refusal clears the draft, and the model writes the line.
        let draft = true;
        const answerLine = () => (draft ? LINE : undefined);
        async function* parts() {
          yield 'Dropped.';
          draft = false;
          yield LINE;
        }
        streamTextMock.mockReturnValueOnce({ textStream: parts(), finishReason: Promise.resolve('stop') });
        const body = await turn({ reservedReply: LINE, emptyReplyLine: EMPTY, answerLine });
        expect(JSON.parse(body).content.trim()).toBe(EMPTY);
        expect(store.get(KEY)).toBe('');
      });

      it('t1: no empty-reply line with no reserved line (AI search) or with text left', async () => {
        streamTextMock.mockReturnValueOnce(answerStream([' ']));
        expect(JSON.parse(await turn({ emptyReplyLine: EMPTY })).content).toBe(' ');
        streamTextMock.mockReturnValueOnce(answerStream([`Ok. ${LINE}`]));
        expect(JSON.parse(await turn({ reservedReply: LINE, emptyReplyLine: EMPTY })).content).toBe('Ok. ');
      });

      describe('LAB-3367 G3: no letter or digit after a removed line', () => {
        it.each([[`**${LINE}**!`], [`. ${LINE}`], [`- ${LINE} :)`], [`*${LINE}*.`]])(
          '%j gets the empty-reply line, stores not known and streams no mark',
          async (text) => {
            for (const at of [1, 2, text.length - 1]) {
              store.delete(KEY);
              streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, at), text.slice(at)]));
              const body = await turn({ reservedReply: LINE, emptyReplyLine: EMPTY });
              // A streamed mark would stay in front of the line: "!I did not ..." or ". I did not ...".
              expect(JSON.parse(body).content.trim()).toBe(EMPTY);
              expect(body).not.toContain(LINE);
              expect(store.get(KEY)).toBe('');
            }
          }
        );

        it('a text with no letter or digit and no removed line still streams', async () => {
          for (const text of ['...', ':)', '**']) {
            streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, 1), text.slice(1)]));
            const body = await turn({ reservedReply: LINE, emptyReplyLine: EMPTY });
            expect(JSON.parse(body).content).toBe(text);
            expect(store.get(KEY)).toBe(text);
          }
        });

        it('a first mark goes out with the first letter, so substantive text is not held', async () => {
          const deltas: string[] = [];
          streamTextMock.mockReturnValueOnce(answerStream(['**', 'Lit', ' is a network.**']));
          const response = await turn.stream({ reservedReply: LINE, emptyReplyLine: EMPTY });
          const reader = response.getReader();
          const decoder = new TextDecoder();
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            deltas.push(decoder.decode(value));
          }
          const joined = deltas.join('');
          expect(JSON.parse(joined).content).toBe('**Lit is a network.**');
          // "**" and "Lit" come out in the same chunk, before " is a network.".
          expect(deltas.some((d) => d.includes('**Lit') && !d.includes('network'))).toBe(true);
        });

        it('AI search (no reserved line) streams a first mark at once', async () => {
          streamTextMock.mockReturnValueOnce(answerStream(['**!**']));
          expect(JSON.parse(await turn({ emptyReplyLine: EMPTY })).content).toBe('**!**');
        });
      });

      it('t7a: a held start of the line goes into the continuation once, not twice', async () => {
        streamTextMock
          .mockReturnValueOnce(answerStream(['Here is a'], 'length'))
          .mockReturnValueOnce(answerStream(['Here is a list of teams.']));
        const body = await turn({ reservedReply: LINE });
        // The held text makes a continuation, not a new answer, with the held text in the partial answer.
        expect(streamTextMock.mock.calls[1][0].prompt).toContain('partialAnswer: Here is a');
        expect(JSON.parse(body).content).toBe('Here is a list of teams.');
      });

      it('t7b: the stream removes the bold line and the "Here’s" form, and keeps other bold text', async () => {
        const HERES = LINE.replace('Here is', 'Here’s');
        streamTextMock.mockReturnValueOnce(
          answerStream([`**Note:** ok.\n\n**${LINE.slice(0, 12)}`, `${LINE.slice(12)}**\n\n__${HERES}__ ${HERES}`])
        );
        const body = await turn({ reservedReply: LINE, reservedReplyForms: [HERES] });
        expect(JSON.parse(body).content).toBe('**Note:** ok.\n\n\n\n ');
      });

      describe('t7: a line split near its closing marks', () => {
        const HERES = LINE.replace('Here is', 'Here’s');
        const forms = [LINE, HERES].flatMap((line) => [line, `**${line}**`, `__${line}__`]);
        // Each split point from the last letter of the line to the end of the closing marks.
        const cases = forms.flatMap((form) => {
          const end = form.lastIndexOf('.');
          return Array.from({ length: form.length - end + 1 }, (_, k) => [form, end + k] as const);
        });

        it.each(cases)('removes %j split at %i, and keeps the text around it', async (form, at) => {
          const text = `Ok. ${form} Done.`;
          const cut = 4 + at;
          streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, cut), text.slice(cut)]));
          const body = await turn({ reservedReply: LINE, reservedReplyForms: [HERES] });
          expect(JSON.parse(body).content).toBe('Ok.  Done.');
        });

        it.each(cases)('gives the empty-reply line for only %j split at %i (t1)', async (form, at) => {
          streamTextMock.mockReturnValueOnce(answerStream([form.slice(0, at), form.slice(at)]));
          const body = await turn({ reservedReply: LINE, reservedReplyForms: [HERES], emptyReplyLine: EMPTY });
          expect(JSON.parse(body).content.trim()).toBe(EMPTY);
          expect(body).not.toContain('*');
          expect(store.get(KEY)).toBe('');
        });

        it('completes a held bold line in the continuation, with no stray marks', async () => {
          streamTextMock
            .mockReturnValueOnce(answerStream([`Ok. **${LINE}`], 'length'))
            .mockReturnValueOnce(answerStream(['** More text.']));
          const body = await turn({ reservedReply: LINE });
          expect(streamTextMock).toHaveBeenCalledTimes(2);
          expect(streamTextMock.mock.calls[1][0].prompt).not.toContain(LINE);
          expect(JSON.parse(body).content).toBe('Ok.  More text.');
        });

        it('completes a cut answer that is only a held bold line, with no stray marks', async () => {
          streamTextMock
            .mockReturnValueOnce(answerStream([`**${LINE}`], 'length'))
            .mockReturnValueOnce(answerStream(['**Done.']));
          const body = await turn({ reservedReply: LINE });
          expect(streamTextMock.mock.calls[1][0].prompt).not.toContain(LINE);
          expect(JSON.parse(body).content).toBe('Done.');
        });

        it.each([
          [`${LINE}**Bold**`, '**Bold**'],
          [`**Note ${LINE}**`, '**Note **'],
          // G3: only marks are left after the removed line, so the turn has no text.
          [`**${LINE}*`, ''],
          ['**Here is a list** of _teams_.', '**Here is a list** of _teams_.'],
        ])('removes only the line and its balanced bold in %j', async (text, kept) => {
          for (const at of [0, 2, 7, text.length - 2, text.length - 1]) {
            streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, at), text.slice(at)]));
            expect(JSON.parse(await turn({ reservedReply: LINE })).content).toBe(kept);
          }
        });
      });

      it('F6: text that only starts like the reserved line still streams', async () => {
        const start = LINE.slice(0, 8);
        streamTextMock.mockReturnValueOnce(answerStream([`A. ${start}`]));
        const body = await turn({ reservedReply: LINE });
        expect(JSON.parse(body).content).toBe(`A. ${start}`);
      });

      describe('LAB-3367 follow-up mutants', () => {
        const HERES = LINE.replace('Here is', 'Here’s');
        const draftStream = (before: string[], after: string[]) => {
          let on = false;
          streamTextMock.mockImplementationOnce(() => ({
            fullStream: (async function* () {
              for (const textDelta of before) yield { type: 'text-delta', textDelta };
              yield { type: 'tool-call', toolCallId: 'c1', toolName: 'draft_intro' };
              on = true;
              for (const textDelta of after) yield { type: 'text-delta', textDelta };
            })(),
            finishReason: Promise.resolve('stop'),
          }));
          return () => (on ? LINE : undefined);
        };

        it('AI search: with no reserved line, the filter is off, also for the line forms', async () => {
          const text = `A. ${LINE} **${LINE}** ${HERES}`;
          streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, 20), text.slice(20)]));
          const body = await readAll(await service.createContextualToolsResponse(chatInfo, false));
          expect(JSON.parse(body).content).toBe(text);
        });

        it('forms with no reservedReply do not turn the filter on', async () => {
          const text = `A. ${HERES} **${HERES}**`;
          streamTextMock.mockReturnValueOnce(answerStream([text.slice(0, 9), text.slice(9)]));
          const body = await turn({ reservedReplyForms: [HERES], emptyReplyLine: EMPTY });
          expect(JSON.parse(body).content).toBe(text);
        });

        it('t1: the no-change line is never in the stored latest reply', async () => {
          streamTextMock.mockReturnValueOnce(answerStream([`**${LINE}**`]));
          await turn({ reservedReply: LINE, reservedReplyForms: [HERES], emptyReplyLine: EMPTY });
          expect(store.get(KEY)).toBe('');
          expect(JSON.stringify(cache.set.mock.calls)).not.toContain(EMPTY);
        });

        it.each([['*'], ['**'], ['_'], ['__']])(
          'u4: the marks %j right before a draft_intro call stay, with the draft line',
          async (marks) => {
            for (const after of [[], ['Hi Grace, Draft-text-91c2.']]) {
              const answerLine = draftStream([`I will write it ${marks}`], after);
              const body = await turn({ reservedReply: LINE, answerLine });
              expect(JSON.parse(body).content).toBe(`I will write it ${marks}\n\n${LINE}`);
            }
          }
        );

        it('u4: held text that is not only marks goes while the draft is on', async () => {
          for (const after of [[], ['Hi Grace, Draft-text-91c2.']]) {
            const answerLine = draftStream(['Ok. ', LINE.slice(0, 9)], after);
            const body = await turn({ reservedReply: LINE, answerLine });
            expect(JSON.parse(body).content).toBe(`Ok. \n\n${LINE}`);
            expect(body).not.toContain('Draft-text-91c2');
          }
        });
      });

      it('F6: with no reserved line, the model text does not change', async () => {
        streamTextMock.mockReturnValueOnce(answerStream([LINE]));
        const body = await turn();
        expect(JSON.parse(body).content).toBe(LINE);
      });

      it('the real answer line is still stored with a reserved line', async () => {
        streamTextMock.mockReturnValueOnce(answerStream(['Dropped.']));
        await turn({ reservedReply: LINE, answerLine: () => LINE });
        expect(store.get(KEY)).toBe(LINE);
      });

      it('the answer prompt has no latestReply field name', async () => {
        streamTextMock.mockReturnValueOnce(answerStream(['Ok.']));
        await turn();
        expect(answerPrompt(0)).not.toContain('latestReply');
        expect(answerPrompt(0)).not.toContain(': unknown');
      });
    });

    it('clears the key before the stream starts, so the old reply is not latest during the turn', async () => {
      store.set(KEY, 'Old reply.');
      let during: unknown;
      streamTextMock.mockImplementationOnce(() => {
        during = store.get(KEY);
        return answerStream(['New reply.']);
      });

      await turn();

      expect(answerPrompt(0)).toContain('Previous reply: "Old reply."');
      expect(during).toBe('');
      expect(store.get(KEY)).toBe('New reply.');
    });

    it('a failed turn writes no reply, so the key stays empty', async () => {
      store.set(KEY, 'Old reply.');
      streamTextMock.mockReturnValue({ textStream: failingChunks(['partial'], new Error('tool exploded')) });

      await expect(turn()).rejects.toThrow('tool exploded');
      await flushBackgroundWork();

      expect(store.get(KEY)).toBe('');
    });

    it('a cancelled stream writes no reply, so the key stays empty', async () => {
      store.set(KEY, 'Old reply.');
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      streamTextMock.mockImplementationOnce(() => ({
        textStream: (async function* () {
          yield 'Part one.';
          await gate;
          yield ' Part two.';
        })(),
        finishReason: Promise.resolve('stop'),
      }));

      const stream = await service.createContextualToolsResponse(chatInfo, false, undefined, { latestReplyKey: KEY });
      const reader = stream.getReader();
      await reader.read();
      await reader.cancel();
      release();
      await flushBackgroundWork();

      expect(store.get(KEY)).toBe('');
      expect(logger.error).not.toHaveBeenCalled();
      expect(generateTextMock).not.toHaveBeenCalled();

      // LAB-3367 F3: the next turn sees that the latest reply is unknown, as the bare word, not as JSON text.
      streamTextMock.mockReturnValueOnce(answerStream(['Next.']));
      await turn();
      expect(answerPrompt(1)).toContain('Previous reply: not available');
      expect(answerPrompt(1)).not.toContain('Old reply.');
      expect(answerPrompt(1)).not.toContain('Previous reply: "unknown"');
    });

    it('a cancel while the reply write is pending clears the key again and does not close the stream', async () => {
      store.set(KEY, 'Old reply.');
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let pending: () => void = () => undefined;
      const writing = new Promise<void>((resolve) => (pending = resolve));
      cache.set.mockImplementation(async (key: string, value: unknown) => {
        store.set(key, value);
        if (key === KEY && value === 'New reply.') {
          pending();
          await gate;
        }
      });
      streamTextMock.mockReturnValueOnce(answerStream(['New reply.']));

      const stream = await service.createContextualToolsResponse(chatInfo, false, undefined, { latestReplyKey: KEY });
      const reader = stream.getReader();
      const reading = (async () => {
        for (;;) if ((await reader.read()).done) return;
      })().catch(() => undefined);
      await writing;
      expect(store.get(KEY)).toBe('New reply.');
      await reader.cancel();
      release();
      await reading;
      await flushBackgroundWork();

      expect(store.get(KEY)).toBe('');
      // No close on the cancelled stream, so no "search failed" log, and no summary for a reply the client did not get.
      expect(logger.error).not.toHaveBeenCalled();
      expect(generateTextMock).not.toHaveBeenCalled();
    });

    /** Reads the whole stream in the background. `done` turns true when the client sees the end of the stream. */
    function readInBackground(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader();
      const state = { done: false, reader };
      const reading = (async () => {
        for (;;) if ((await reader.read()).done) break;
        state.done = true;
      })().catch(() => undefined);
      return { state, reading };
    }
    const KEY_LOG = 'latest reply of the LabOS agent thread';

    it('i3: the client sees no end of the stream while the reply write is pending', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      let pending: () => void = () => undefined;
      const writing = new Promise<void>((resolve) => (pending = resolve));
      cache.set.mockImplementation(async (key: string, value: unknown) => {
        if (key === KEY && value === 'The reply.') {
          pending();
          await gate;
        }
        store.set(key, value);
      });
      streamTextMock.mockReturnValueOnce(answerStream(['The reply.']));

      const { state, reading } = readInBackground(await turn.stream());
      await writing;
      // Far less than the write timeout: the stream must still wait for the write.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(state.done).toBe(false);
      expect(store.get(KEY)).toBe('');
      release();
      await reading;

      expect(state.done).toBe(true);
      expect(store.get(KEY)).toBe('The reply.');
    });

    describe('cache timeouts (i1)', () => {
      beforeEach(() => {
        (service as any).latestReplyTimeoutMs = 20;
      });

      it('sends the read and then the clear with no wait between them, and a late read starts nothing', async () => {
        let lateRead: (value: unknown) => void = () => undefined;
        cache.get.mockImplementation((key: string) =>
          key === KEY ? new Promise((resolve) => (lateRead = resolve)) : Promise.resolve(null)
        );
        streamTextMock.mockReturnValueOnce(answerStream(['New reply.']));

        const body = JSON.parse(await turn());

        expect(body.content).toBe('New reply.');
        const keyCalls = (mock: jest.Mock) =>
          mock.mock.calls
            .map((call, index) => [call, mock.mock.invocationCallOrder[index]] as const)
            .filter(([call]) => call[0] === KEY);
        const [[, readOrder]] = keyCalls(cache.get);
        const [[clearCall, clearOrder]] = keyCalls(cache.set);
        expect(clearCall).toEqual([KEY, '']);
        expect(clearOrder).toBeGreaterThan(readOrder);
        // The clear went out before the read timed out, as the next cache call of this turn.
        expect(clearOrder).toBe(readOrder + 1);
        // A timed-out read is not used, because it can be old.
        expect(answerPrompt(0)).toContain('Previous reply: not available');
        expect(logger.error).toHaveBeenCalledWith(`Timed out reading and clearing the ${KEY_LOG}`);
        expect(store.get(KEY)).toBe('New reply.');

        const setsBefore = cache.set.mock.calls.length;
        lateRead('Old reply.');
        await flushBackgroundWork();
        expect(cache.set.mock.calls.length).toBe(setsBefore);
        expect(store.get(KEY)).toBe('New reply.');
      });

      it('a write that times out does not stop the turn: the stream ends, with a fixed log line', async () => {
        cache.set.mockImplementation(async (key: string, value: unknown) => {
          if (key === KEY && value === 'The reply.') return new Promise<void>(() => undefined);
          store.set(key, value);
        });
        streamTextMock.mockReturnValueOnce(answerStream(['The reply.']));

        const body = JSON.parse(await turn());

        expect(body.content).toBe('The reply.');
        expect(logger.error).toHaveBeenCalledWith(`Timed out on the write of the ${KEY_LOG}`);
        expect(JSON.stringify(logger.error.mock.calls)).not.toContain('The reply.');
      });

      it('the clear after a cancel during the write also has the timeout, with a fixed log line', async () => {
        let writeStarted: () => void = () => undefined;
        const writing = new Promise<void>((resolve) => (writeStarted = resolve));
        let started = false;
        cache.set.mockImplementation(async (key: string, value: unknown) => {
          if (key === KEY && value === 'The reply.') {
            started = true;
            writeStarted();
            return new Promise<void>(() => undefined);
          }
          // After the write starts, the clear of the cancel cleanup never answers.
          if (key === KEY && started) return new Promise<void>(() => undefined);
          store.set(key, value);
        });
        streamTextMock.mockReturnValueOnce(answerStream(['The reply.']));

        const { state } = readInBackground(await turn.stream());
        await writing;
        await state.reader.cancel();
        await new Promise((resolve) => setTimeout(resolve, 100));

        expect(cache.set).toHaveBeenLastCalledWith(KEY, '');
        expect(logger.error.mock.calls.map((call) => call[0])).toEqual([
          `Timed out on the write of the ${KEY_LOG}`,
          `Timed out on the clear of the ${KEY_LOG}`,
        ]);
      });
    });

    it('i5: a client stop during the structured tail gets no log line', async () => {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      streamTextMock.mockReturnValueOnce(answerStream(['The reply.']));
      streamObjectMock.mockImplementationOnce(() => ({
        textStream: (async function* () {
          await gate;
          yield TAIL;
        })(),
        object: gate.then(() => JSON.parse(TAIL)),
      }));

      const stream = await turn.stream();
      const reader = stream.getReader();
      // Read until the answer text is out, so the tail call runs.
      let seen = '';
      while (!seen.includes('The reply.')) seen += new TextDecoder().decode((await reader.read()).value);
      await reader.cancel();
      release();
      await flushBackgroundWork();

      expect(logger.error).not.toHaveBeenCalled();
      expect(store.get(KEY)).toBe('');
    });

    describe('when the answer is cut off', () => {
      it('stores the reply when the continuation completes it', async () => {
        streamTextMock
          .mockReturnValueOnce(answerStream(['Half'], 'length'))
          .mockReturnValueOnce(answerStream([' and the rest.']));

        await turn();

        expect(store.get(KEY)).toBe('Half and the rest.');
      });

      it('stores no reply when the continuation is cut off as well, and the key stays empty', async () => {
        store.set(KEY, 'Old reply.');
        streamTextMock
          .mockReturnValueOnce(answerStream(['Half'], 'length'))
          .mockReturnValueOnce(answerStream([' more'], 'length'));

        const body = JSON.parse(await turn());

        expect(body.content).toContain(HUSKY_SEARCH_STALLED_NOTICE.trim());
        expect(answerPrompt(1)).toContain('Previous reply: "Old reply."');
        expect(store.get(KEY)).toBe('');
      });
    });

    it('a cache failure does not stop the turn, and the logs have fixed texts only', async () => {
      cache.get.mockImplementation(async (key: string) => {
        if (key === KEY) throw new Error(`GET ${KEY} Secret-reply-3d7e`);
        return null;
      });
      cache.set.mockImplementation(async (key: string) => {
        if (key === KEY) throw new Error(`SET ${KEY} Secret-reply-3d7e`);
      });
      streamTextMock.mockReturnValue(answerStream(['Secret-reply-3d7e']));

      const body = JSON.parse(await turn());
      await flushBackgroundWork();

      expect(body.content).toBe('Secret-reply-3d7e');
      expect(answerPrompt(0)).toContain('Previous reply: not available');
      const lines = logger.error.mock.calls.map((call) => call.join(' '));
      expect(lines).toEqual(
        expect.arrayContaining([
          'Failed to read the latest reply of the LabOS agent thread',
          'Failed to clear the latest reply of the LabOS agent thread',
          'Failed to write the latest reply of the LabOS agent thread',
        ])
      );
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('Secret-reply-3d7e');
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain('m-1');
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

  it('applies the caller options: page context, extra tools, extra response fields and no MongoDB writes', async () => {
    toolsService.getTools.mockReturnValue({ getTeamNews: 'news-tool' });
    streamTextMock.mockReturnValue(answerStream(['Hello']));
    streamObjectMock.mockReturnValue(structuredStream(['{}']));

    const out = await readAll(
      await service.createContextualToolsResponse(chatInfo, false, undefined, {
        promptContext: 'The member is reading story news-1.',
        extraTools: { list_news: 'list-tool' } as any,
        extraResponseFields: { proposals: [] },
        persistHistory: false,
      })
    );
    await flushBackgroundWork();

    const body = JSON.parse(out);
    expect(body.content).toBe('Hello');
    expect(body.proposals).toEqual([]);
    expect(streamTextMock.mock.calls[0][0].tools).toEqual({ getTeamNews: 'news-tool', list_news: 'list-tool' });
    expect(streamTextMock.mock.calls[0][0].prompt).toContain('pageContext: The member is reading story news-1.');
    expect(streamObjectMock.mock.calls[0][0].prompt).toContain('pageContext: The member is reading story news-1.');
    expect(cache.set).toHaveBeenCalledWith('thread-1:summary', 'summary text');
    expect(persistent.create).not.toHaveBeenCalled();
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
    expect(persistent.updateDocByKeyValue).not.toHaveBeenCalled();
  });

  describe('thread owner (LAB-3459)', () => {
    const OWNER = 'owner@example.com';
    const handedOver = {
      user: 'Original blog question',
      system: 'Original blog answer',
      sources: [],
      followUpQuestions: [],
      actions: [],
      threadId: 'thread-1',
      chatId: 'chat-0',
    };
    const ownedThread = () => ({ threadId: 'thread-1', email: OWNER, contextual: [] as any[] });

    const answer = () => {
      streamTextMock.mockReturnValue(answerStream(['Answer']));
      streamObjectMock.mockReturnValue(structuredStream(['{"followUpQuestions":[],"sources":[],"actions":[]}']));
    };
    /** Both turns (the hand-over and the new one) and the summary reached Redis and Mongo. */
    const expectWritten = (thread: { contextual?: any[] } | null) => {
      const docs = thread ? persistent.updateDocByKeyValue.mock.calls : persistent.create.mock.calls;
      const turns = thread ? thread.contextual : docs.map((call) => call[1].contextual[0]);
      expect(docs.length).toBeGreaterThan(0);
      expect(turns?.map((turn) => turn.questionId)).toEqual(['chat-0', 'chat-1']);
      expect(cache.set).toHaveBeenCalledWith('thread-1:summary', 'summary text');
      expect(persistent.upsertByKeyValue).toHaveBeenCalledWith(
        'chats_summary',
        'threadId',
        'thread-1',
        expect.objectContaining({ summary: 'summary text' })
      );
    };

    it.each([
      ['another member', 'other@example.com', true],
      ['a guest', undefined, false],
    ])(
      "refuses %s on a member's thread: no turn, no summary, no hand-over",
      async (_who, email: string | undefined, isLoggedIn: boolean) => {
        persistent.findOneByKeyValue.mockResolvedValue(ownedThread());
        persistent.getDocByKeyValue.mockResolvedValue(ownedThread());
        cache.get.mockResolvedValue("the owner's summary");
        answer();

        const call = service.createContextualToolsResponse({ ...chatInfo, chatSummary: handedOver }, isLoggedIn, email);

        await expect(call).rejects.toThrow(ForbiddenException);
        await expect(call).rejects.toThrow('Start a new thread or duplicate this one.');
        await flushBackgroundWork();
        expect(persistent.findOneByKeyValue).toHaveBeenCalledWith('threads', 'threadId', 'thread-1');
        expect(persistent.create).not.toHaveBeenCalled();
        expect(persistent.updateDocByKeyValue).not.toHaveBeenCalled();
        expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
        expect(persistent.updateByKeyValue).not.toHaveBeenCalled();
        expect(cache.set).not.toHaveBeenCalled();
        // The owner's summary does not reach the caller's answer either.
        expect(cache.get).not.toHaveBeenCalled();
        expect(generateTextMock).not.toHaveBeenCalled();
        expect(streamTextMock).not.toHaveBeenCalled();
      }
    );

    it('lets the owner continue their thread: the hand-over, the turn and the summary are written', async () => {
      const thread = ownedThread();
      persistent.findOneByKeyValue.mockResolvedValue(thread);
      persistent.getDocByKeyValue.mockResolvedValue(thread);
      answer();

      await readAll(
        await service.createContextualToolsResponse(
          { ...chatInfo, chatId: 'chat-1', chatSummary: handedOver },
          true,
          OWNER
        )
      );
      await flushBackgroundWork();

      expectWritten(thread);
      expect(persistent.updateDocByKeyValue).toHaveBeenCalledWith(
        'threads',
        'threadId',
        'thread-1',
        expect.objectContaining({ email: OWNER })
      );
    });

    it.each([
      ['a member on a guest thread', { threadId: 'thread-1', contextual: [] as any[] }, 'member@example.com', true],
      ['a guest on a guest thread', { threadId: 'thread-1', contextual: [] as any[] }, undefined, false],
      ['a member on a new thread', null, 'member@example.com', true],
    ])(
      'writes as before for %s',
      async (_case, thread: { contextual: any[] } | null, email: string | undefined, isLoggedIn: boolean) => {
        persistent.findOneByKeyValue.mockResolvedValue(thread && { ...thread });
        persistent.getDocByKeyValue.mockResolvedValue(thread);
        answer();

        await readAll(
          await service.createContextualToolsResponse(
            { ...chatInfo, chatId: 'chat-1', chatSummary: handedOver },
            isLoggedIn,
            email
          )
        );
        await flushBackgroundWork();

        expectWritten(thread);
      }
    );

    describe('duplicate', () => {
      const summaryDoc = { threadId: 'thread-1', summary: 'the summary' };
      const stored = (thread: unknown) =>
        persistent.findOneByKeyValue.mockImplementation(async (collection: string) =>
          collection === 'threads' ? thread : summaryDoc
        );

      it("still refuses to duplicate another member's thread", async () => {
        stored(ownedThread());

        await expect(service.duplicateThread('thread-1', 'other@example.com')).rejects.toThrow(ForbiddenException);
        expect(persistent.create).not.toHaveBeenCalled();
      });

      it.each([
        ['a member', 'member@example.com', undefined, true],
        ['a guest', '', 'guest-1', false],
      ])(
        'lets %s duplicate a guest thread and continue the copy',
        async (_who, email: string, guestUserId: string | undefined, isLoggedIn: boolean) => {
          stored({ threadId: 'thread-1', title: 'Storage', contextual: [{ questionId: 'chat-0' }] });
          prisma.member.findUnique.mockResolvedValue({ name: 'Ada', image: null });

          const { threadId: copyId } = await service.duplicateThread('thread-1', email, guestUserId);

          const copy = persistent.create.mock.calls[0][1];
          expect(copy).toEqual(
            expect.objectContaining({ threadId: copyId, createdFrom: 'thread-1', ...(email && { email }) })
          );
          expect(copy.email).toBe(email || undefined);
          expect(copy.guestUserId).toBe(guestUserId);
          expect(cache.set).toHaveBeenCalledWith(`${copyId}:summary`, 'the summary');

          persistent.create.mockClear();
          stored(copy);
          persistent.getDocByKeyValue.mockResolvedValue(copy);
          answer();
          await readAll(
            await service.createContextualToolsResponse(
              { ...chatInfo, threadId: copyId, chatId: 'chat-1' },
              isLoggedIn,
              email || undefined
            )
          );
          await flushBackgroundWork();

          expect(copy.contextual.map((turn) => turn.questionId)).toEqual(['chat-0', 'chat-1']);
          expect(cache.set).toHaveBeenCalledWith(`${copyId}:summary`, 'summary text');
        }
      );
    });
  });
});

describe('HuskyAiService.getThreadById', () => {
  const thread = {
    threadId: 'thread-1',
    email: 'owner@example.com',
    contextual: [
      { questionId: 'q-1', question: 'Who works on storage?', createdAt: 1 },
      { questionId: 'q-2', question: 'Who funds it?', createdAt: 2 },
    ],
  };

  const createService = () => {
    const persistent = {
      findOneByKeyValue: jest.fn((collection: string) => Promise.resolve(collection === 'threads' ? thread : null)),
      findByKeyValue: jest.fn().mockResolvedValue([{ questionId: 'q-2', rating: 1, reasons: ['Out of date'] }]),
    };
    const service = new HuskyAiService(
      { error: jest.fn(), info: jest.fn() } as any,
      { set: jest.fn() } as any,
      persistent as any,
      {} as any,
      {} as any,
      {} as any
    );
    return { service, persistent };
  };

  beforeEach(() => {
    process.env.MONGO_THREADS_COLLECTION = 'threads';
    process.env.MONGO_FEEDBACK_COLLECTION = 'feedback';
  });

  it("returns the owner's vote on each answer they rated", async () => {
    const { service, persistent } = createService();

    const result = await service.getThreadById('thread-1', 'owner@example.com');

    expect(persistent.findByKeyValue).toHaveBeenCalledWith('feedback', 'threadId', 'thread-1');
    expect(result.chats.map((chat) => chat.feedback)).toEqual([undefined, { rating: 1, reasons: ['Out of date'] }]);
  });

  it('returns no votes to a reader who does not own the thread', async () => {
    const { service } = createService();
    thread.email = '';

    const result = await service.getThreadById('thread-1', 'reader@example.com');

    expect(result.chats.map((chat) => chat.feedback)).toEqual([undefined, undefined]);
    thread.email = 'owner@example.com';
  });
});

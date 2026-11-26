// The same module mocks as husky-ai.service.spec.ts: the @ai-sdk/* packages and some tools ship ESM this jest config
// cannot parse, and `ai` itself is mocked.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
jest.mock('ai', () => ({ streamText: jest.fn(), streamObject: jest.fn(), generateText: jest.fn() }));
jest.mock('./tools/demo-day.tool', () => ({ DemoDayTool: jest.fn() }));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('./tools/irl-events.tool', () => ({ IrlEventsTool: jest.fn() }));
jest.mock('./tools/husky-ai-tools.serivice', () => ({ HuskyAiToolsService: jest.fn() }));

import { generateText, streamObject, streamText } from 'ai';
import { HuskyAiService, PersistedTurn } from './husky-ai.service';

if (!(globalThis as any).ReadableStream) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (globalThis as any).ReadableStream = require('stream/web').ReadableStream;
}

const streamTextMock = streamText as jest.Mock;
const streamObjectMock = streamObject as jest.Mock;
const generateTextMock = generateText as jest.Mock;

async function* chunks(parts: string[]) {
  for (const part of parts) yield part;
}

const TAIL = {
  followUpQuestions: ['What does the team build?'],
  sources: ['https://example.com/team'],
  actions: [{ name: 'Example Team', directoryLink: '/teams/abc', type: 'Team' }],
};

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

async function flush() {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve));
}

describe('HuskyAiService persistTurn (LAB-3457)', () => {
  const chatInfo = { question: 'Tell me about Example Team', threadId: 'thread-1', chatId: 'chat-1' };
  let cache: { get: jest.Mock; set: jest.Mock };
  let persistent: Record<string, jest.Mock>;
  let logger: { error: jest.Mock; info: jest.Mock };
  let service: HuskyAiService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MONGO_THREADS_COLLECTION = 'threads';
    process.env.MONGO_CHATS_SUMMARY_COLLECTION = 'chats_summary';
    cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
    persistent = {
      getDocByKeyValue: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(undefined),
      updateDocByKeyValue: jest.fn().mockResolvedValue(undefined),
      upsertByKeyValue: jest.fn().mockResolvedValue(undefined),
      findOneByKeyValue: jest.fn().mockResolvedValue(null),
      findByKeyValue: jest.fn().mockResolvedValue([]),
    };
    logger = { error: jest.fn(), info: jest.fn() };
    generateTextMock.mockResolvedValue({ text: 'summary text' });
    streamTextMock.mockReturnValue({ textStream: chunks(['Hello ', 'world']), finishReason: Promise.resolve('stop') });
    streamObjectMock.mockReturnValue({ textStream: chunks(['{}']), object: Promise.resolve(TAIL) });
    service = new HuskyAiService(
      logger as any,
      cache as any,
      persistent as any,
      { member: { findUnique: jest.fn().mockResolvedValue(null) } } as any,
      { getTools: jest.fn().mockReturnValue({}) } as any,
      { getResponsesModel: jest.fn().mockReturnValue('model') } as any
    );
  });

  it('AI search (no options) still writes its own turn with the same keys and no agent fields (old-turn probe)', async () => {
    const out = await readAll(await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com'));
    await flush();

    expect(JSON.parse(out).content).toBe('Hello world');
    expect(persistent.create).toHaveBeenCalledTimes(1);
    const [collection, doc] = persistent.create.mock.calls[0];
    expect(collection).toBe('threads');
    expect(Object.keys(doc).sort()).toEqual(['contextual', 'createdAt', 'threadId', 'updatedAt']);
    const turn = doc.contextual[0];
    expect(Object.keys(turn).sort()).toEqual(
      [
        'actions',
        'createdAt',
        'followUpQuestions',
        'question',
        'questionId',
        'response',
        'sourceRefs',
        'sources',
      ].sort()
    );
    expect(turn).toMatchObject({ questionId: 'chat-1', question: chatInfo.question, response: 'Hello world' });
    expect(persistent.upsertByKeyValue).toHaveBeenCalledWith(
      'chats_summary',
      'threadId',
      'thread-1',
      expect.objectContaining({ summary: 'summary text' })
    );
  });

  it('gives the finished turn to persistTurn before the stream closes, and skips the AI search turn write', async () => {
    let closed = false;
    const saved: PersistedTurn[] = [];
    const persistTurn = jest.fn(async (turn: PersistedTurn) => {
      saved.push(turn);
      expect(closed).toBe(false);
    });

    const stream = await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com', {
      persistHistory: true,
      persistTurn,
    });
    await readAll(stream);
    closed = true;
    await flush();

    expect(persistTurn).toHaveBeenCalledTimes(1);
    expect(saved[0]).toMatchObject({
      question: chatInfo.question,
      content: 'Hello world',
      steps: ['Understanding your question', 'Writing the answer'],
      tail: expect.objectContaining({ followUpQuestions: TAIL.followUpQuestions, actions: TAIL.actions }),
      summary: expect.objectContaining({ toolNames: [], sources: TAIL.sources }),
    });
    expect(persistent.create).not.toHaveBeenCalled();
    expect(persistent.updateDocByKeyValue).not.toHaveBeenCalled();
    // The summary still goes to MongoDB, so a thread continued after a day keeps its memory.
    expect(persistent.upsertByKeyValue).toHaveBeenCalledWith(
      'chats_summary',
      'threadId',
      'thread-1',
      expect.objectContaining({ summary: 'summary text' })
    );
  });

  it('does not call persistTurn when persistHistory is false', async () => {
    const persistTurn = jest.fn().mockResolvedValue(undefined);
    await readAll(
      await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com', {
        persistHistory: false,
        persistTurn,
      })
    );
    await flush();
    expect(persistTurn).not.toHaveBeenCalled();
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
  });

  it('closes the stream and logs a fixed line when persistTurn fails', async () => {
    const out = await readAll(
      await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com', {
        persistHistory: true,
        persistTurn: jest.fn().mockRejectedValue(new Error('secret turn text')),
      })
    );
    expect(JSON.parse(out).content).toBe('Hello world');
    const lines = logger.error.mock.calls.map(([line]) => String(line));
    expect(lines).toContain('Failed saving the turn of thread thread-1, chat chat-1');
    expect(lines.join('\n')).not.toContain('secret turn text');
  });

  it('waits for a slow persistTurn at most the timeout', async () => {
    (service as any).persistTurnTimeoutMs = 20;
    const out = await readAll(
      await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com', {
        persistHistory: true,
        persistTurn: () => new Promise<void>(() => undefined),
      })
    );
    expect(JSON.parse(out).content).toBe('Hello world');
    expect(logger.error).toHaveBeenCalledWith('Timed out saving the turn of thread thread-1, chat chat-1');
  });

  it('gives no turn when the answer fails', async () => {
    streamTextMock.mockImplementation(() => {
      throw new Error('provider down');
    });
    const persistTurn = jest.fn().mockResolvedValue(undefined);
    const stream = await service.createContextualToolsResponse(chatInfo, true, 'ada@example.com', {
      persistHistory: true,
      persistTurn,
    });
    await expect(readAll(stream)).rejects.toThrow();
    expect(persistTurn).not.toHaveBeenCalled();
  });
});

describe('HuskyAiService.getThreadsByEmail (LAB-3457)', () => {
  it('leaves agent threads out of the AI search list and keeps threads with no source', async () => {
    const persistent = {
      findByKeyValue: jest.fn().mockResolvedValue([
        { threadId: 'old', title: 'Old chat', createdAt: 1, updatedAt: 1 },
        { threadId: 'agent', title: 'Agent chat', source: 'agent', createdAt: 2, updatedAt: 3 },
        { threadId: 'continued', title: 'Continued', memberUid: 'm-1', createdAt: 2, updatedAt: 2 },
      ]),
    };
    const service = new HuskyAiService(
      { error: jest.fn(), info: jest.fn() } as any,
      {} as any,
      persistent as any,
      {} as any,
      {} as any,
      {} as any
    );
    const threads = await service.getThreadsByEmail('ada@example.com');
    expect(threads).toEqual([
      { threadId: 'continued', title: 'Continued', createdAt: 2, updatedAt: 2 },
      { threadId: 'old', title: 'Old chat', createdAt: 1, updatedAt: 1 },
    ]);
  });
});

describe('HuskyAiService.generateThreadTitle (LAB-3457)', () => {
  it('returns the model title and an empty string when the model gives none', async () => {
    const service = new HuskyAiService(
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { getResponsesModel: jest.fn().mockReturnValue('model') } as any
    );
    generateTextMock.mockResolvedValueOnce({ text: 'Storage teams' }).mockResolvedValueOnce({ text: '' });
    await expect(service.generateThreadTitle('Who works on storage?')).resolves.toBe('Storage teams');
    await expect(service.generateThreadTitle('Who works on storage?')).resolves.toBe('');
    expect(generateTextMock.mock.calls[0][0].prompt).toContain('Who works on storage?');
  });
});

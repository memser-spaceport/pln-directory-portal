// The same module mocks as husky-ai.service.spec.ts: these packages ship ESM this jest config cannot parse.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
jest.mock('ai', () => ({ streamText: jest.fn(), streamObject: jest.fn(), generateText: jest.fn() }));
jest.mock('./tools/husky-ai-tools.serivice', () => ({ HuskyAiToolsService: jest.fn() }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { generateText } from 'ai';
import { MongoPersistantDbService } from './db/mongo-persistant-db.service';
import { HuskyAiService } from './husky-ai.service';

type Doc = Record<string, any>;

/** The filter rules the Mongo service uses here: equality and `$ne` (a missing field is not equal to `true`). */
function matches(doc: Doc, filter: Doc): boolean {
  return Object.entries(filter).every(([key, want]) =>
    want && typeof want === 'object' && '$ne' in want ? doc[key] !== want.$ne : doc[key] === want
  );
}

/** The real MongoPersistantDbService over in-memory collections, so its own filters are what is tested. */
function mongo(collections: Record<string, Doc[]>) {
  const db = Object.create(MongoPersistantDbService.prototype) as MongoPersistantDbService;
  const collection = (name: string) => {
    const docs = (collections[name] ??= []);
    return {
      findOne: async (filter: Doc) => docs.find((doc) => matches(doc, filter)) ?? null,
      find: (filter: Doc) => ({ sort: () => ({ toArray: async () => docs.filter((doc) => matches(doc, filter)) }) }),
      insertOne: async (doc: Doc) => void docs.push({ ...doc }),
      updateOne: async (filter: Doc, update: Doc) => {
        const doc = docs.find((item) => matches(item, filter));
        if (doc) Object.assign(doc, update.$set ?? {});
      },
    };
  };
  (db as any).getCollection = async (name: string) => collection(name);
  return db;
}

describe('AI search thread reads by id leave soft-deleted threads out (LAB-3457)', () => {
  const ADA = 'ada@example.com';
  const turn = { questionId: 'q-1', question: 'Who works on storage?', response: 'Team A.', createdAt: 1 };
  let collections: Record<string, Doc[]>;
  let service: HuskyAiService;

  beforeEach(() => {
    process.env.MONGO_THREADS_COLLECTION = 'threads';
    process.env.MONGO_CHATS_SUMMARY_COLLECTION = 'chats_summary';
    process.env.MONGO_FEEDBACK_COLLECTION = 'feedback';
    collections = {
      threads: [
        { threadId: 'live', email: ADA, title: 'Storage', contextual: [turn], createdAt: 1, updatedAt: 1 },
        { threadId: 'gone', email: ADA, title: 'Deleted', contextual: [turn], isDeleted: true, createdAt: 1 },
        { threadId: 'gone-guest', title: 'Deleted guest', contextual: [turn], isDeleted: true, createdAt: 1 },
        { threadId: 'gone-bob', email: 'bob@example.com', title: 'Bob', isDeleted: true, createdAt: 1 },
      ],
      chats_summary: [
        { threadId: 'live', summary: 'live summary' },
        { threadId: 'gone', summary: 'deleted summary' },
      ],
      feedback: [],
    };
    (generateText as jest.Mock).mockResolvedValue({ text: 'A title' });
    service = new HuskyAiService(
      { error: jest.fn(), info: jest.fn() } as any,
      { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) } as any,
      mongo(collections) as any,
      { member: { findUnique: jest.fn().mockResolvedValue({ name: 'Ada', image: null }) } } as any,
      { getTools: jest.fn().mockReturnValue({}) } as any,
      { getResponsesModel: jest.fn().mockReturnValue('model') } as any
    );
  });

  it('GET /v1/husky/threads/:id: a live thread as before, a deleted one is 404 in or out of the gate', async () => {
    await expect(service.getThreadById('live', ADA)).resolves.toEqual(
      expect.objectContaining({
        threadId: 'live',
        title: 'Storage',
        isOwner: true,
        chats: [expect.objectContaining(turn)],
      })
    );
    for (const [threadId, email] of [
      ['gone', ADA],
      ['gone-guest', ''],
      ['gone-guest', ADA],
    ]) {
      await expect(service.getThreadById(threadId, email)).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('duplicate: a live thread is copied with its summary; a deleted one is 404 and nothing is copied', async () => {
    const copy = await service.duplicateThread('live', ADA);
    expect(collections.threads).toContainEqual(
      expect.objectContaining({ threadId: copy.threadId, createdFrom: 'live', contextual: [turn], email: ADA })
    );
    expect(collections.chats_summary).toContainEqual(
      expect.objectContaining({ threadId: copy.threadId, summary: 'live summary' })
    );

    const before = collections.threads.length;
    await expect(service.duplicateThread('gone', ADA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.duplicateThread('gone-guest', '', 'guest-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(collections.threads).toHaveLength(before);
  });

  it('delete and title: a deleted thread is 404, a live thread works as before', async () => {
    await expect(service.deleteThreadEmail('gone', ADA)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createThreadBasicInfo('gone', 'Who?', ADA)).rejects.toBeInstanceOf(NotFoundException);
    expect(collections.threads.find((doc) => doc.threadId === 'gone')?.title).toBe('Deleted');

    await service.createThreadBasicInfo('live', 'Who works on storage?', ADA);
    expect(collections.threads.find((doc) => doc.threadId === 'live')?.title).toBe('A title');
    await service.deleteThreadEmail('live', ADA);
    expect(collections.threads.find((doc) => doc.threadId === 'live')?.isDeleted).toBe(true);
    await expect(service.getThreadById('live', ADA)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("the LAB-3459 writer check still sees a deleted thread: another member's is refused, not taken as new", async () => {
    await expect(
      service.createContextualToolsResponse({ question: 'Hi', threadId: 'gone-bob', chatId: 'c-1' }, true, ADA)
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

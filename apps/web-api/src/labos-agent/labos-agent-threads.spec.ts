// The guard and the agent service pull in ESM packages this jest config cannot parse. They are not under test here:
// the threads service gets a plain agent object with `enabledMember`.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('./labos-agent.service', () => ({ LabosAgentService: class {} }));
jest.mock('../intro-requests/intro-requests.service', () => ({ IntroRequestsService: jest.fn() }));
// labos-agent-proposals imports `tool` from the ESM `ai` package.
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { ConflictException, ForbiddenException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LabosAgentThreadsController } from './labos-agent-threads.controller';
import { LabosAgentThreadsService } from './labos-agent-threads.service';
import {
  firstQuestionTitle,
  summaryCacheKey,
  LabosAgentThreadStore,
  ownerFilter,
  ownsThread,
  seedSummary,
  ThreadDoc,
} from './labos-agent-threads.store';

const NOW = Date.parse('2026-11-26T12:00:00.000Z');
const ME = { memberUid: 'member-1', email: 'ada@example.com' };

/** The error body as the client gets it; `statusCode` is the HTTP status. */
const body = (error: any) => ({ ...error.getResponse(), statusCode: error.getStatus() });

function fakeMongo() {
  return {
    findOneWhere: jest.fn().mockResolvedValue(null),
    updateOneWhere: jest.fn().mockResolvedValue({ matchedCount: 1, modifiedCount: 1, upsertedCount: 0 }),
    countWhere: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue([]),
    findByKeyValue: jest.fn().mockResolvedValue([]),
  };
}

const proposal = (extra: Record<string, unknown> = {}) => ({
  proposalId: 'ap_1',
  tool: 'update_my_profile',
  title: 'Update your Bio',
  targetType: 'member',
  targetUid: 'member-1',
  changes: [{ field: 'bio', label: 'Bio', oldValue: 'a', newValue: 'b' }],
  expiresAt: '2026-11-26T12:15:00.000Z',
  status: 'open',
  ...extra,
});

const draft = (extra: Record<string, unknown> = {}) => ({
  draftId: 'dr_1',
  kind: 'intro',
  target: { type: 'team', uid: 'team-1', name: 'Acme' },
  text: 'Hello Acme, I would like an intro please.',
  minLength: 20,
  maxLength: 3500,
  source: 'agent',
  status: 'open',
  ...extra,
});

const legacyThread = (): ThreadDoc => ({
  threadId: 'old-1',
  title: 'Storage teams',
  email: ME.email,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  contextual: [
    {
      questionId: 'q-2',
      question: 'Who funds them?',
      response: 'Fund X.',
      sources: [],
      actions: [],
      followUpQuestions: [],
      createdAt: 1_700_000_100_000,
    },
    {
      questionId: 'q-1',
      question: 'Who works on storage?',
      response: 'Team A [1].',
      sources: ['https://a.example'],
      sourceRefs: [{ index: 1, title: 'Team A', type: 'team', directoryLink: '/teams/a' } as any],
      actions: [{ name: 'Team A', directoryLink: '/teams/a', type: 'Team' }],
      followUpQuestions: ['What does Team A build?'],
      createdAt: 1_700_000_000_000,
    },
  ],
});

const agentThread = (turnExtra: Record<string, unknown> = {}): ThreadDoc => ({
  threadId: 'agent-1',
  title: 'Intro to Acme',
  email: ME.email,
  memberUid: ME.memberUid,
  source: 'agent',
  context: { page: 'team', teamUid: 'team-1' },
  createdAt: NOW - 1000,
  updatedAt: NOW - 500,
  contextual: [
    {
      questionId: 'c-1',
      question: 'Intro to Acme please',
      response: 'Here is a draft intro.',
      sources: [],
      actions: [],
      followUpQuestions: [],
      createdAt: NOW - 1000,
      kind: 'agent',
      steps: ['Understanding your question', 'Writing the answer'],
      context: { page: 'team', teamUid: 'team-1' },
      proposals: [proposal() as any],
      drafts: [draft() as any],
      toolCount: 1,
      usedWebSearch: false,
      sourceCount: 0,
      ...turnExtra,
    },
  ],
});

function setup(opts: { doc?: ThreadDoc | null; enabled?: boolean; rbacFails?: boolean } = {}) {
  const mongo = fakeMongo();
  let doc = opts.doc === undefined ? null : opts.doc;
  mongo.findOneWhere.mockImplementation(async (collection: string) => (collection === 'threads' ? doc : null));
  const cache = { get: jest.fn().mockResolvedValue(null), set: jest.fn().mockResolvedValue(undefined) };
  const store = new LabosAgentThreadStore(mongo as any, cache as any);
  const agent = {
    enabledMember: jest.fn(async (email: string) => {
      if (opts.enabled === false) throw new ForbiddenException({ statusCode: 403, code: 'AGENT_NOT_ENABLED' });
      if (email !== ME.email) throw new Error('unexpected email');
      return ME.memberUid;
    }),
    gatedMember: jest.fn(async () => {
      if (opts.rbacFails) throw new ServiceUnavailableException('Intro requests are not available right now.');
      return opts.enabled === false ? undefined : ME.memberUid;
    }),
  };
  const proposals = { load: jest.fn().mockResolvedValue(undefined) };
  const introRequests = { create: jest.fn().mockResolvedValue({ uid: 'ir_1' }) };
  const service = new LabosAgentThreadsService(agent as any, store, proposals as any, introRequests as any);
  const controller = new LabosAgentThreadsController(service);
  const req = { userEmail: ME.email };
  return {
    mongo,
    cache,
    store,
    proposals,
    introRequests,
    service,
    controller,
    req,
    setDoc: (next: ThreadDoc | null) => (doc = next),
  };
}

describe('LabOS agent thread store (LAB-3457)', () => {
  it('owner rule: memberUid wins; a thread with no memberUid belongs to its email; a guest thread to nobody', () => {
    expect(ownsThread({ memberUid: 'member-1', email: 'other@example.com' }, 'member-1', ME.email)).toBe(true);
    expect(ownsThread({ memberUid: 'member-2', email: ME.email }, 'member-1', ME.email)).toBe(false);
    expect(ownsThread({ email: ME.email }, 'member-1', ME.email)).toBe(true);
    expect(ownsThread({ email: 'other@example.com' }, 'member-1', ME.email)).toBe(false);
    expect(ownsThread({}, 'member-1', ME.email)).toBe(false);
    expect(ownsThread({}, 'member-1', '')).toBe(false);
    expect(ownerFilter('member-1', ME.email)).toEqual({
      $or: [{ memberUid: 'member-1' }, { memberUid: null, email: ME.email }],
    });
    expect(ownerFilter('member-1', '')).toEqual({ $or: [{ memberUid: 'member-1' }] });
  });

  it('the memory key is per member and thread, per env, and free of collisions', () => {
    const env = process.env.ENVIRONMENT;
    process.env.ENVIRONMENT = 'dev';
    const key = summaryCacheKey('member-1', 'thread-1');
    expect(key).toBe('dev:labos-agent:summary:["member-1","thread-1"]');
    expect(key).not.toBe(summaryCacheKey('member-2', 'thread-1'));
    expect(key).not.toBe('thread-1:summary');
    expect(summaryCacheKey('a:b', 'c')).not.toBe(summaryCacheKey('a', 'b:c'));
    process.env.ENVIRONMENT = 'lab-3272';
    expect(summaryCacheKey('member-1', 'thread-1')).not.toBe(key);
    process.env.ENVIRONMENT = env;
  });

  it('title: one line of the first question, at most 80 characters, never empty', () => {
    expect(firstQuestionTitle('  Who works\n on storage? ')).toBe('Who works on storage?');
    expect(firstQuestionTitle('x'.repeat(200))).toHaveLength(80);
    expect(firstQuestionTitle('x'.repeat(200)).endsWith('…')).toBe(true);
    expect(firstQuestionTitle(undefined)).toBe('Chat');
  });

  it('seeds the memory from the last three turns, with short answers', () => {
    const turns = [1, 2, 3, 4].map((n) => ({ questionId: `q${n}`, question: `Q${n}?`, response: `A${n}`.repeat(200) }));
    const seed = seedSummary(turns);
    expect(seed).not.toContain('Q1?');
    expect(seed).toContain('The member asked: Q2?');
    expect(seed).toContain('The member asked: Q4?');
    expect(seed.length).toBeLessThanOrEqual(1500);
  });

  it('a new thread: an insert-only upsert on threadId, then the push under the owner rule', async () => {
    const h = setup();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    const turn = { questionId: 'c-1', question: 'Hi', response: 'Hello', kind: 'agent' as const };
    await expect(
      h.store.appendTurn({ threadId: 't-new', ...ME, isNew: true }, { title: 'Hi', context: { page: 'home' } }, turn)
    ).resolves.toBe(true);
    expect(h.mongo.updateOneWhere.mock.calls).toEqual([
      [
        'threads',
        { threadId: 't-new' },
        {
          $setOnInsert: {
            source: 'agent',
            memberUid: 'member-1',
            email: ME.email,
            title: 'Hi',
            createdAt: NOW,
            updatedAt: NOW,
            contextual: [],
            context: { page: 'home' },
          },
        },
        { upsert: true },
      ],
      [
        'threads',
        { threadId: 't-new', isDeleted: { $ne: true }, ...ownerFilter(ME.memberUid, ME.email) },
        { $set: { memberUid: 'member-1', updatedAt: NOW }, $push: { contextual: turn } },
      ],
    ]);
    jest.restoreAllMocks();
  });

  it('G2: a doc of that id that appeared during the stream and is not own gets no write and does not move', async () => {
    // A tiny in-memory collection with the Mongo rules the store relies on: an upsert matches on threadId and only
    // inserts with $setOnInsert; a filtered update with no match changes nothing.
    const docs: Array<Record<string, any>> = [{ threadId: 't-race', memberUid: 'member-2', email: 'bob@example.com' }];
    const matches = (doc: Record<string, any>, filter: Record<string, any>) =>
      Object.entries(filter).every(([key, want]) => {
        if (key === '$or') return (want as Array<Record<string, any>>).some((part) => matches(doc, part));
        if (want && typeof want === 'object' && '$ne' in want) return doc[key] !== want.$ne;
        return (doc[key] ?? null) === want;
      });
    const h = setup();
    h.mongo.updateOneWhere.mockImplementation(async (_c: string, filter: any, update: any, options: any) => {
      const doc = docs.find((item) => matches(item, filter));
      if (!doc) {
        if (!options?.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
        docs.push({ ...filter, ...update.$setOnInsert });
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
      }
      Object.assign(doc, update.$set ?? {});
      if (update.$push) doc.contextual = [...(doc.contextual ?? []), update.$push.contextual];
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    });
    const turn = { questionId: 'c-1', question: 'Hi', response: 'Hello', kind: 'agent' as const };

    await expect(h.store.appendTurn({ threadId: 't-race', ...ME, isNew: true }, { title: 'Hi' }, turn)).resolves.toBe(
      false
    );
    expect(docs).toEqual([{ threadId: 't-race', memberUid: 'member-2', email: 'bob@example.com' }]);

    // A guest AI search doc (no owner) is not taken either.
    docs.splice(0, 1, { threadId: 't-race', contextual: [{ questionId: 'g-1' }] });
    await expect(h.store.appendTurn({ threadId: 't-race', ...ME, isNew: true }, { title: 'Hi' }, turn)).resolves.toBe(
      false
    );
    expect(docs).toEqual([{ threadId: 't-race', contextual: [{ questionId: 'g-1' }] }]);

    // No doc: the member's new thread with the turn.
    docs.splice(0, 1);
    await expect(h.store.appendTurn({ threadId: 't-race', ...ME, isNew: true }, { title: 'Hi' }, turn)).resolves.toBe(
      true
    );
    expect(docs).toEqual([
      expect.objectContaining({ threadId: 't-race', memberUid: 'member-1', source: 'agent', contextual: [turn] }),
    ]);
  });

  it('an own thread: no upsert, the owner and not-deleted rule in the filter, source and title untouched', async () => {
    const h = setup();
    h.mongo.updateOneWhere.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    // A thread deleted or taken during the stream: not saved.
    await expect(
      h.store.appendTurn(
        { threadId: 'old-1', ...ME, isNew: false },
        { title: 'ignored' },
        { questionId: 'c-0', question: 'Q', response: 'A' }
      )
    ).resolves.toBe(false);
    h.mongo.updateOneWhere.mockClear();
    await h.store.appendTurn(
      { threadId: 'old-1', ...ME, isNew: false },
      { title: 'ignored' },
      {
        questionId: 'c-2',
        question: 'More?',
        response: 'Yes',
      }
    );
    const [collection, filter, update, options] = h.mongo.updateOneWhere.mock.calls[0];
    expect(collection).toBe('threads');
    expect(filter).toEqual({ threadId: 'old-1', isDeleted: { $ne: true }, ...ownerFilter(ME.memberUid, ME.email) });
    expect(update).not.toHaveProperty('$setOnInsert');
    expect(options).toBeUndefined();
  });

  it('G1: removes only the agent turn of that chat id, under the owner rule', async () => {
    const h = setup();
    await h.store.removeTurn('agent-1', 'c-1', ME.memberUid, ME.email);
    expect(h.mongo.updateOneWhere).toHaveBeenCalledWith(
      'threads',
      { threadId: 'agent-1', ...ownerFilter(ME.memberUid, ME.email) },
      { $pull: { contextual: { questionId: 'c-1', kind: 'agent' } } }
    );
  });

  it('a draft change matches only that draft in the given state, with array filters', async () => {
    const h = setup();
    h.mongo.updateOneWhere.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    await expect(h.store.updateDraft('agent-1', 'dr_1', 'open', { status: 'sent' })).resolves.toBe(false);
    const [, filter, update, options] = h.mongo.updateOneWhere.mock.calls[0];
    expect(filter).toEqual({
      threadId: 'agent-1',
      isDeleted: { $ne: true },
      contextual: { $elemMatch: { drafts: { $elemMatch: { draftId: 'dr_1', status: 'open' } } } },
    });
    expect(update).toEqual({ $set: { 'contextual.$[t].drafts.$[d].status': 'sent' } });
    expect(options).toEqual({
      arrayFilters: [{ 't.drafts.draftId': 'dr_1' }, { 'd.draftId': 'dr_1', 'd.status': 'open' }],
    });
    await expect(h.store.updateDraft('agent-1', 'dr_1', 'sent', { status: 'open' }, ['sentAt'])).resolves.toBe(true);
    expect(h.mongo.updateOneWhere.mock.calls[1][2]).toEqual({
      $set: { 'contextual.$[t].drafts.$[d].status': 'open' },
      $unset: { 'contextual.$[t].drafts.$[d].sentAt': '' },
    });
  });

  it('a proposal state goes to that proposal only', async () => {
    const h = setup();
    await h.store.markProposal('agent-1', 'ap_1', 'done', 'Your profile is updated: Bio.');
    expect(h.mongo.updateOneWhere).toHaveBeenCalledWith(
      'threads',
      { threadId: 'agent-1', 'contextual.proposals.proposalId': 'ap_1' },
      {
        $set: {
          'contextual.$[t].proposals.$[p].status': 'done',
          'contextual.$[t].proposals.$[p].summary': 'Your profile is updated: Bio.',
        },
      },
      { arrayFilters: [{ 't.proposals.proposalId': 'ap_1' }, { 'p.proposalId': 'ap_1' }] }
    );
  });

  it('memory: keeps a cached summary, else loads the saved one, else seeds from the turns', async () => {
    const h = setup();
    // A summary under the shared AI search key is never used: only the member's own key counts.
    h.cache.get.mockImplementation(async (key: string) => (key === 'old-1:summary' ? 'shared' : null));
    h.mongo.findOneWhere.mockResolvedValue(null);
    await h.store.warmSummary(legacyThread(), ME.memberUid);
    expect(h.cache.set).toHaveBeenCalledWith(summaryCacheKey(ME.memberUid, 'old-1'), expect.stringContaining('Who'));
    expect(h.cache.set.mock.calls.map(([key]) => key)).not.toContain('old-1:summary');
    h.cache.set.mockClear();

    h.cache.get.mockImplementation(async (key: string) =>
      key === summaryCacheKey(ME.memberUid, 'old-1') ? 'cached' : null
    );
    await h.store.warmSummary(legacyThread(), ME.memberUid);
    expect(h.cache.set).not.toHaveBeenCalled();
    h.cache.get.mockResolvedValue(null);

    h.mongo.findOneWhere.mockImplementation(async (collection: string) =>
      collection === 'chats_summary' ? { threadId: 'old-1', summary: 'saved summary' } : null
    );
    await h.store.warmSummary(legacyThread(), ME.memberUid);
    expect(h.cache.set).toHaveBeenLastCalledWith(summaryCacheKey(ME.memberUid, 'old-1'), 'saved summary');

    h.mongo.findOneWhere.mockResolvedValue(null);
    await h.store.warmSummary(legacyThread(), ME.memberUid);
    expect(h.cache.set).toHaveBeenLastCalledWith(
      summaryCacheKey(ME.memberUid, 'old-1'),
      expect.stringContaining('Who works on storage?')
    );

    h.cache.set.mockClear();
    await h.store.warmSummary({ threadId: 'empty', contextual: [] }, ME.memberUid);
    expect(h.cache.set).not.toHaveBeenCalled();
  });
});

describe('T1 GET /v1/labos-agent/threads (LAB-3457)', () => {
  it('uses the guard on every route', () => {
    const { list, get, remove, confirmDraft } = LabosAgentThreadsController.prototype;
    for (const handler of [list, get, remove, confirmDraft]) {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenValidation]);
    }
  });

  it('lists old AI search threads and agent threads together, paged, with a title for each', async () => {
    const h = setup();
    h.mongo.countWhere.mockResolvedValue(41);
    h.mongo.aggregate.mockResolvedValue([
      {
        threadId: 'agent-1',
        title: 'Intro to Acme',
        source: 'agent',
        context: { page: 'home' },
        createdAt: NOW,
        updatedAt: NOW,
      },
      { threadId: 'old-1', title: '', firstQuestion: 'Who works on storage?', createdAt: 1_700_000_000_000 },
    ]);

    const result = await h.controller.list({ page: '3', limit: '20' }, h.req);

    expect(result).toEqual({
      page: 3,
      limit: 20,
      total: 41,
      items: [
        {
          threadId: 'agent-1',
          title: 'Intro to Acme',
          source: 'agent',
          context: { page: 'home' },
          createdAt: new Date(NOW).toISOString(),
          updatedAt: new Date(NOW).toISOString(),
        },
        {
          threadId: 'old-1',
          title: 'Who works on storage?',
          source: 'ai-search',
          createdAt: new Date(1_700_000_000_000).toISOString(),
          updatedAt: new Date(1_700_000_000_000).toISOString(),
        },
      ],
    });
    const filter = {
      ...ownerFilter(ME.memberUid, ME.email),
      isDeleted: { $ne: true },
      'contextual.0': { $exists: true },
    };
    expect(h.mongo.countWhere).toHaveBeenCalledWith('threads', filter);
    const pipeline = h.mongo.aggregate.mock.calls[0][1];
    expect(pipeline.slice(0, 4)).toEqual([
      { $match: filter },
      { $sort: { updatedAt: -1, _id: -1 } },
      { $skip: 40 },
      { $limit: 20 },
    ]);
    // The list reads no turns, only the first question.
    expect(pipeline[4].$project._id).toBe(0);
    expect(pipeline[4].$project).not.toHaveProperty('contextual');
  });

  it('defaults to page 1 and 20 rows, and refuses a bad page or limit with 400', async () => {
    const h = setup();
    await expect(h.controller.list({}, h.req)).resolves.toEqual(expect.objectContaining({ page: 1, limit: 20 }));
    for (const query of [{ page: '0' }, { limit: '51' }, { limit: '1.5' }, { page: 'x' }]) {
      const error = await h.controller.list(query, h.req).catch((e) => e);
      expect(body(error)).toEqual(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
    }
  });

  it('is 403 outside the gate', async () => {
    const h = setup({ enabled: false });
    const error = await h.controller.list({}, h.req).catch((e) => e);
    expect(body(error)).toEqual(expect.objectContaining({ statusCode: 403, code: 'AGENT_NOT_ENABLED' }));
    expect(h.mongo.aggregate).not.toHaveBeenCalled();
  });
});

describe('T2 GET /v1/labos-agent/threads/:threadId (LAB-3457)', () => {
  beforeEach(() => {
    process.env.MONGO_FEEDBACK_COLLECTION = 'feedback';
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  it('shows an old AI search thread as saved, oldest turn first, with feedback, and loads its memory', async () => {
    const h = setup({ doc: legacyThread() });
    h.mongo.findByKeyValue.mockResolvedValue([{ questionId: 'q-1', rating: 1, reasons: ['Helpful'] }]);

    const thread = await h.controller.get('old-1', h.req);

    expect(thread).toEqual({
      threadId: 'old-1',
      title: 'Storage teams',
      source: 'ai-search',
      createdAt: new Date(1_700_000_000_000).toISOString(),
      updatedAt: new Date(1_700_000_100_000).toISOString(),
      turns: [
        {
          kind: 'ai-search',
          chatId: 'q-1',
          question: 'Who works on storage?',
          content: 'Team A [1].',
          sources: ['https://a.example'],
          sourceRefs: [{ index: 1, title: 'Team A', type: 'team', directoryLink: '/teams/a' }],
          followUpQuestions: ['What does Team A build?'],
          actions: [{ name: 'Team A', directoryLink: '/teams/a', type: 'Team' }],
          createdAt: new Date(1_700_000_000_000).toISOString(),
          feedback: { rating: 1, reasons: ['Helpful'] },
        },
        {
          kind: 'ai-search',
          chatId: 'q-2',
          question: 'Who funds them?',
          content: 'Fund X.',
          sources: [],
          followUpQuestions: [],
          actions: [],
          createdAt: new Date(1_700_000_100_000).toISOString(),
        },
      ],
    });
    expect(h.mongo.findByKeyValue).toHaveBeenCalledWith('feedback', 'threadId', 'old-1');
    expect(h.cache.set).toHaveBeenCalledWith(summaryCacheKey(ME.memberUid, 'old-1'), expect.stringContaining('Who'));
  });

  it('shows agent cards in their final state: expired after expiresAt, closed from the C2 record, sent drafts', async () => {
    const doc = agentThread({
      proposals: [
        proposal({ proposalId: 'ap_done', status: 'done', summary: 'Your profile is updated: Bio.' }),
        proposal({ proposalId: 'ap_old', expiresAt: '2026-11-26T11:00:00.000Z' }),
        proposal({ proposalId: 'ap_closed' }),
        proposal({ proposalId: 'ap_open' }),
      ],
      drafts: [draft({ status: 'sent', introRequestUid: 'ir_9', sentAt: NOW - 100 }), draft({ draftId: 'dr_2' })],
    });
    const h = setup({ doc });
    h.proposals.load.mockImplementation(async (id: string) =>
      id === 'ap_closed' ? { status: 'cancelled' } : { status: 'open' }
    );

    const thread = await h.controller.get('agent-1', h.req);

    expect(thread).toEqual(expect.objectContaining({ source: 'agent', context: { page: 'team', teamUid: 'team-1' } }));
    const [turn] = thread.turns;
    expect(turn.kind).toBe('agent');
    if (turn.kind !== 'agent') return;
    expect(turn.steps).toEqual(['Understanding your question', 'Writing the answer']);
    expect(turn.proposals.map((item) => [item.proposalId, item.status])).toEqual([
      ['ap_done', 'done'],
      ['ap_old', 'expired'],
      ['ap_closed', 'cancelled'],
      ['ap_open', 'open'],
    ]);
    expect(turn.proposals[0].summary).toBe('Your profile is updated: Bio.');
    expect(turn.drafts).toEqual([
      expect.objectContaining({
        draftId: 'dr_1',
        status: 'sent',
        introRequestUid: 'ir_9',
        sentAt: new Date(NOW - 100).toISOString(),
      }),
      expect.objectContaining({ draftId: 'dr_2', status: 'open' }),
    ]);
    expect(turn).toEqual(expect.objectContaining({ toolCount: 1, usedWebSearch: false, sourceCount: 0 }));
  });

  it("is 404 THREAD_NOT_FOUND for another member's, a guest's and a deleted thread", async () => {
    for (const doc of [
      { ...agentThread(), memberUid: 'member-2' },
      { ...legacyThread(), email: 'other@example.com' },
      { ...legacyThread(), email: undefined },
      { ...legacyThread(), isDeleted: true },
      null,
    ]) {
      const h = setup({ doc: doc as ThreadDoc | null });
      const error = await h.controller.get('x', h.req).catch((e) => e);
      expect(body(error)).toEqual({ statusCode: 404, code: 'THREAD_NOT_FOUND', message: 'Thread not found' });
      expect(h.cache.set).not.toHaveBeenCalled();
    }
  });

  it('refuses a thread id over 64 characters with 400', async () => {
    const h = setup();
    const error = await h.controller.get('x'.repeat(65), h.req).catch((e) => e);
    expect(body(error)).toEqual(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
  });
});

describe('T3 DELETE /v1/labos-agent/threads/:threadId (LAB-3457)', () => {
  it('soft deletes the own thread only, and a second delete is 404', async () => {
    const h = setup();
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    await expect(h.controller.remove('old-1', h.req)).resolves.toEqual({ threadId: 'old-1', deleted: true });
    expect(h.mongo.updateOneWhere).toHaveBeenCalledWith(
      'threads',
      { threadId: 'old-1', isDeleted: { $ne: true }, ...ownerFilter(ME.memberUid, ME.email) },
      { $set: { isDeleted: true, deletedAt: NOW } }
    );
    h.mongo.updateOneWhere.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0, upsertedCount: 0 });
    const error = await h.controller.remove('old-1', h.req).catch((e) => e);
    expect(body(error)).toEqual(expect.objectContaining({ statusCode: 404, code: 'THREAD_NOT_FOUND' }));
    jest.restoreAllMocks();
  });
});

describe('C5 POST /v1/labos-agent/drafts/confirm (LAB-3457)', () => {
  const SEND = {
    threadId: 'agent-1',
    draftId: 'dr_1',
    decision: 'send',
    text: '  Hello Acme, please introduce me to your founders.  ',
  };

  /** A store whose draft state follows the atomic updates, so two requests at once see each other. */
  function liveDraft(h: ReturnType<typeof setup>, doc: ThreadDoc) {
    const current = () => doc.contextual?.[0].drafts?.[0] as any;
    h.mongo.updateOneWhere.mockImplementation(async (_c: string, filter: any, update: any) => {
      const wanted = filter.contextual.$elemMatch.drafts.$elemMatch;
      const item = current();
      if (!item || item.draftId !== wanted.draftId || item.status !== wanted.status) {
        return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
      }
      for (const [path, value] of Object.entries(update.$set ?? {})) item[path.split('.').pop() as string] = value;
      for (const path of Object.keys(update.$unset ?? {})) delete item[path.split('.').pop() as string];
      return { matchedCount: 1, modifiedCount: 1, upsertedCount: 0 };
    });
    return current;
  }

  it('sends once to the saved target with the edited text, and saves the sent state', async () => {
    const doc = agentThread();
    const h = setup({ doc });
    const current = liveDraft(h, doc);

    const [first, second] = await Promise.all([
      h.controller.confirmDraft(SEND, h.req).catch((e) => e),
      h.controller.confirmDraft(SEND, h.req).catch((e) => e),
    ]);

    const sent = [first, second].find((result) => result?.status === 'sent');
    const other = [first, second].find((result) => result !== sent);
    expect(sent).toEqual({ draftId: 'dr_1', status: 'sent', introRequestUid: 'ir_1' });
    expect(body(other)).toEqual({
      statusCode: 409,
      code: 'DRAFT_CLOSED',
      message: 'The draft is closed',
      status: 'sent',
    });
    expect(h.introRequests.create).toHaveBeenCalledTimes(1);
    expect(h.introRequests.create).toHaveBeenCalledWith(ME.email, {
      type: 'TEAM',
      targetId: 'team-1',
      text: 'Hello Acme, please introduce me to your founders.',
    });
    expect(current()).toEqual(
      expect.objectContaining({
        status: 'sent',
        text: 'Hello Acme, please introduce me to your founders.',
        introRequestUid: 'ir_1',
        sentAt: expect.any(Number),
      })
    );
    // A reopened card cannot send again.
    expect(body(await h.controller.confirmDraft(SEND, h.req).catch((e) => e))).toEqual(
      expect.objectContaining({ statusCode: 409, status: 'sent' })
    );
    expect(h.introRequests.create).toHaveBeenCalledTimes(1);
  });

  it('puts the draft back to open with its saved text when the intro API fails, and passes its error', async () => {
    const doc = agentThread();
    const h = setup({ doc });
    const current = liveDraft(h, doc);
    const refusal = new ForbiddenException('You cannot request intros');
    h.introRequests.create.mockRejectedValueOnce(refusal);

    await expect(h.controller.confirmDraft(SEND, h.req)).rejects.toBe(refusal);
    expect(current()).toEqual(
      expect.objectContaining({ status: 'open', text: 'Hello Acme, I would like an intro please.' })
    );
    expect(current()).not.toHaveProperty('sentAt');
    await expect(h.controller.confirmDraft(SEND, h.req)).resolves.toEqual(expect.objectContaining({ status: 'sent' }));
  });

  it('cancel closes the draft without sending; then send and cancel are 409 cancelled', async () => {
    const doc = agentThread();
    const h = setup({ doc });
    const current = liveDraft(h, doc);
    const cancel = { threadId: 'agent-1', draftId: 'dr_1', decision: 'cancel' };
    await expect(h.controller.confirmDraft(cancel, h.req)).resolves.toEqual({ draftId: 'dr_1', status: 'cancelled' });
    expect(current().status).toBe('cancelled');
    for (const next of [SEND, cancel]) {
      expect(body(await h.controller.confirmDraft(next, h.req).catch((e) => e))).toEqual(
        expect.objectContaining({ statusCode: 409, code: 'DRAFT_CLOSED', status: 'cancelled' })
      );
    }
    expect(h.introRequests.create).not.toHaveBeenCalled();
  });

  it('is 404 for an unknown draft, and THREAD_NOT_FOUND for a thread that is not own', async () => {
    const h = setup({ doc: agentThread() });
    expect(body(await h.controller.confirmDraft({ ...SEND, draftId: 'dr_x' }, h.req).catch((e) => e))).toEqual(
      expect.objectContaining({ statusCode: 404, code: 'DRAFT_NOT_FOUND' })
    );
    h.setDoc({ ...agentThread(), memberUid: 'member-2' });
    expect(body(await h.controller.confirmDraft(SEND, h.req).catch((e) => e))).toEqual(
      expect.objectContaining({ statusCode: 404, code: 'THREAD_NOT_FOUND' })
    );
    expect(h.introRequests.create).not.toHaveBeenCalled();
  });

  it('validates the body: send needs 20 to 3500 characters, no extra keys, a known decision', async () => {
    const h = setup({ doc: agentThread() });
    for (const bad of [
      { threadId: 'agent-1', draftId: 'dr_1', decision: 'send' },
      { ...SEND, text: '   too short   ' },
      { ...SEND, text: 'x'.repeat(3501) },
      { ...SEND, target: { type: 'member', uid: 'm-9' } },
      { ...SEND, decision: 'resend' },
    ]) {
      expect(body(await h.controller.confirmDraft(bad, h.req).catch((e) => e))).toEqual(
        expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' })
      );
    }
    expect(h.introRequests.create).not.toHaveBeenCalled();
  });

  it('logs a fixed line when the sent state cannot be completed, and still reports sent', async () => {
    const doc = agentThread();
    const h = setup({ doc });
    liveDraft(h, doc);
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const claim = h.mongo.updateOneWhere.getMockImplementation() as any;
    h.mongo.updateOneWhere.mockImplementationOnce(claim).mockRejectedValueOnce(new Error('mongo down'));
    await expect(h.controller.confirmDraft(SEND, h.req)).resolves.toEqual(expect.objectContaining({ status: 'sent' }));
    expect(log).toHaveBeenCalledWith('Failed to save the intro request of a sent LabOS agent draft');
    log.mockRestore();
  });

  describe('the C3 route gate: a saved draft is never sent by C3 and C5 both', () => {
    const C3 = { type: 'TEAM' as const, targetId: 'team-1', text: 'Hello Acme, please introduce me to your founders.' };

    /** The aggregate of `draftsTo` over the live doc: open or sent drafts to the target. */
    function savedDrafts(h: ReturnType<typeof setup>, doc: ThreadDoc) {
      h.mongo.aggregate.mockImplementation(async () =>
        (doc.contextual ?? []).flatMap((turn) =>
          (turn.drafts ?? [])
            .filter((item) => item.target.uid === 'team-1' && item.target.type === 'team')
            .filter((item) => item.status === 'open' || item.status === 'sent')
            .map((item) => ({ threadId: doc.threadId, draft: item }))
        )
      );
    }

    it('registers itself as the C3 route gate', () => {
      const h = setup();
      const useRouteGate = jest.fn();
      (h.introRequests as any).useRouteGate = useRouteGate;
      h.service.onModuleInit();
      expect(useRouteGate).toHaveBeenCalledWith(expect.any(Function));
    });

    it('outside the agent gate: plain C3, no MongoDB read', async () => {
      const h = setup({ enabled: false });
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });
      await expect(h.service.throughSavedDraft(ME.email, C3, send)).resolves.toEqual({ uid: 'ir_c3' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(h.mongo.aggregate).not.toHaveBeenCalled();
    });

    it('G3: a failed permission lookup is 503 and sends nothing (a gated member never falls to plain C3)', async () => {
      const h = setup({ doc: agentThread(), rbacFails: true });
      const send = jest.fn();
      const error = await h.service.throughSavedDraft(ME.email, C3, send).catch((e) => e);
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(send).not.toHaveBeenCalled();
      expect(h.mongo.aggregate).not.toHaveBeenCalled();
    });

    it('reads only own, not deleted threads with an open or sent draft to that target', async () => {
      const h = setup();
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });
      await expect(h.service.throughSavedDraft(ME.email, C3, send)).resolves.toEqual({ uid: 'ir_c3' });
      const [collection, pipeline] = h.mongo.aggregate.mock.calls[0];
      expect(collection).toBe('threads');
      const wanted = { 'target.type': 'team', 'target.uid': 'team-1', status: { $in: ['open', 'sent'] } };
      expect(pipeline[0]).toEqual({
        $match: {
          ...ownerFilter(ME.memberUid, ME.email),
          isDeleted: { $ne: true },
          contextual: { $elemMatch: { drafts: { $elemMatch: wanted } } },
        },
      });
      expect(pipeline[3]).toEqual({
        $match: {
          'contextual.drafts.target.type': 'team',
          'contextual.drafts.target.uid': 'team-1',
          'contextual.drafts.status': { $in: ['open', 'sent'] },
        },
      });
    });

    it('an open saved draft goes through the C5 claim: C3 sends once, then C5 is 409 sent', async () => {
      const doc = agentThread();
      const h = setup({ doc });
      const current = liveDraft(h, doc);
      savedDrafts(h, doc);
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });

      await expect(h.service.throughSavedDraft(ME.email, C3, send)).resolves.toEqual({ uid: 'ir_c3' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(current()).toEqual(expect.objectContaining({ status: 'sent', text: C3.text, introRequestUid: 'ir_c3' }));

      expect(body(await h.controller.confirmDraft(SEND, h.req).catch((e) => e))).toEqual(
        expect.objectContaining({ statusCode: 409, code: 'DRAFT_CLOSED', status: 'sent' })
      );
      expect(h.introRequests.create).not.toHaveBeenCalled();
    });

    it('C3 after a C5 send of that draft with the same text is 409 sent and sends nothing', async () => {
      const doc = agentThread();
      const h = setup({ doc });
      liveDraft(h, doc);
      savedDrafts(h, doc);
      await h.controller.confirmDraft(SEND, h.req);
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });

      const error = await h.service.throughSavedDraft(ME.email, C3, send).catch((e) => e);
      expect(body(error)).toEqual(expect.objectContaining({ statusCode: 409, code: 'DRAFT_CLOSED', status: 'sent' }));
      expect(send).not.toHaveBeenCalled();

      // Another text to the same target is a new intro from the intro dialog: plain C3.
      await expect(
        h.service.throughSavedDraft(ME.email, { ...C3, text: 'A different intro about our roadmap.' }, send)
      ).resolves.toEqual({ uid: 'ir_c3' });
      expect(send).toHaveBeenCalledTimes(1);
    });

    it('C3 and C5 at the same time send once', async () => {
      const doc = agentThread();
      const h = setup({ doc });
      liveDraft(h, doc);
      savedDrafts(h, doc);
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });

      const [viaC3, viaC5] = await Promise.all([
        h.service.throughSavedDraft(ME.email, C3, send).catch((e) => e),
        h.controller.confirmDraft(SEND, h.req).catch((e) => e),
      ]);
      expect(send.mock.calls.length + h.introRequests.create.mock.calls.length).toBe(1);
      const refused = [viaC3, viaC5].filter((result) => result instanceof ConflictException);
      expect(refused).toHaveLength(1);
    });

    it('a failed C3 send puts the draft back to open with its saved text and passes the error', async () => {
      const doc = agentThread();
      const h = setup({ doc });
      const current = liveDraft(h, doc);
      savedDrafts(h, doc);
      const refusal = new ForbiddenException('You cannot request intros');

      await expect(h.service.throughSavedDraft(ME.email, C3, jest.fn().mockRejectedValue(refusal))).rejects.toBe(
        refusal
      );
      expect(current()).toEqual(
        expect.objectContaining({ status: 'open', text: 'Hello Acme, I would like an intro please.' })
      );
      expect(current()).not.toHaveProperty('sentAt');
    });

    it('a cancelled saved draft does not block C3', async () => {
      const doc = agentThread({ drafts: [draft({ status: 'cancelled' })] });
      const h = setup({ doc });
      savedDrafts(h, doc);
      const send = jest.fn().mockResolvedValue({ uid: 'ir_c3' });
      await expect(h.service.throughSavedDraft(ME.email, C3, send)).resolves.toEqual({ uid: 'ir_c3' });
      expect(h.mongo.updateOneWhere).not.toHaveBeenCalled();
    });

    it('fails closed when the saved drafts cannot be read', async () => {
      const h = setup();
      h.mongo.aggregate.mockRejectedValue(new Error('mongo down'));
      const send = jest.fn();
      await expect(h.service.throughSavedDraft(ME.email, C3, send)).rejects.toThrow('mongo down');
      expect(send).not.toHaveBeenCalled();
    });
  });
});

// The same light mocks as labos-agent.spec.ts: the guard and the AI search service pull in ESM packages.
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class UserTokenValidation {} }));
jest.mock('../husky/husky-ai.service', () => ({ HuskyAiService: jest.fn() }));
jest.mock('../team-news/team-news-query.service', () => ({ TeamNewsQueryService: jest.fn() }));
jest.mock('../team-news/team-news-suggestions.service', () => ({ TeamNewsSuggestionsService: jest.fn() }));
jest.mock('../mcp/mcp-tool-catalog', () => ({ McpToolCatalog: jest.fn() }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({ AccessControlV2Service: jest.fn() }));
jest.mock('../intro-requests/intro-requests.service', () => ({ IntroRequestsService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('ai', () => ({ tool: (def: unknown) => def }));

import { Logger } from '@nestjs/common';
import { APP_ENV } from '../utils/constants';
import { LabosAgentAccessService } from './labos-agent-access.service';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';
import { summaryCacheKey, ThreadDoc } from './labos-agent-threads.store';

if (!(globalThis as any).WritableStream) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (globalThis as any).WritableStream = require('stream/web').WritableStream;
}

const NOW = Date.parse('2026-11-26T12:00:00.000Z');
const VALID = { threadId: 'thread-1', chatId: 'chat-1', message: '  Who works on storage?  ' };

function setup(doc: ThreadDoc | null = null) {
  process.env.ENVIRONMENT = APP_ENV.DEV;
  const prisma = { member: { findUnique: jest.fn().mockResolvedValue({ uid: 'member-1', deletedAt: null }) } };
  const stream = { pipeTo: jest.fn().mockResolvedValue(undefined) };
  const husky = {
    createContextualToolsResponse: jest.fn().mockResolvedValue(stream),
    generateThreadTitle: jest.fn().mockResolvedValue('Storage teams'),
  };
  const threads = {
    find: jest.fn().mockResolvedValue(doc),
    warmSummary: jest.fn().mockResolvedValue(undefined),
    appendTurn: jest.fn().mockResolvedValue(undefined),
    replaceTitle: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LabosAgentService(
    prisma as any,
    new LabosAgentAccessService({ hasPermission: jest.fn().mockResolvedValue({ allowed: false }) } as any),
    husky as any,
    { getTeamNewsItemDto: jest.fn() } as any,
    { forApp: jest.fn(() => []) } as any,
    { getMemberAccess: jest.fn().mockResolvedValue({ effectivePermissions: [] }) } as any,
    {} as any,
    { adminCaps: jest.fn().mockResolvedValue({}) } as any,
    { findAgentTargetName: jest.fn(), findEligibleRequester: jest.fn() } as any,
    {} as any,
    {} as any,
    threads as any
  );
  const controller = new LabosAgentController(service);
  const res = {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    on: jest.fn(),
    off: jest.fn(),
  };
  const req = { userEmail: 'ada@example.com' };
  const chat = (body: Record<string, unknown>) => controller.chat(body, req, res as any).catch((error) => error);
  const options = () => husky.createContextualToolsResponse.mock.calls.at(-1)[3];
  return { husky, threads, chat, options };
}

/** The error body as the client gets it; `statusCode` is the HTTP status. */
const body = (error: any) => ({ ...error.getResponse(), statusCode: error.getStatus() });

/** A finished turn as the Husky stream gives it to `persistTurn`. */
const finished = () => ({
  question: 'Who works on storage?',
  content: 'Team A works on storage [1].',
  steps: ['Understanding your question', 'Searching teams', 'Found 1 team', 'Writing the answer'],
  tail: {
    followUpQuestions: ['What does Team A build?'],
    sources: ['https://directory.plnetwork.io/teams/a', 'https://team-a.example/blog'],
    actions: [{ name: 'Team A', directoryLink: '/teams/a', type: 'Team' }],
    sourceRefs: [{ index: 1, title: 'Team A', type: 'team', directoryLink: '/teams/a' }],
  },
  summary: {
    toolNames: ['getTeams'],
    sources: ['https://directory.plnetwork.io/teams/a', 'https://team-a.example/blog'],
    sourceRefs: [{ index: 1, title: 'Team A', type: 'team', directoryLink: '/teams/a' }],
  },
});

describe('C1 and the shared chat history (LAB-3457)', () => {
  const originalEnv = process.env.ENVIRONMENT;
  beforeEach(() => jest.spyOn(Date, 'now').mockReturnValue(NOW));
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    process.env.ENVIRONMENT = originalEnv;
  });

  it('without persist: no saved turn, as before LAB-3457', async () => {
    const h = setup();
    await h.chat(VALID);
    expect(h.options().persistHistory).toBe(false);
    expect(h.options()).not.toHaveProperty('persistTurn');
    expect(h.threads.find).toHaveBeenCalledWith('thread-1');
    expect(h.threads.warmSummary).not.toHaveBeenCalled();
  });

  it('scopes the thread memory to the member and the thread, with or without persist (LAB-3459 follow-up)', async () => {
    for (const persist of [undefined, true]) {
      const h = setup();
      await h.chat({ ...VALID, persist });
      expect(h.options().summaryKey).toBe(summaryCacheKey('member-1', 'thread-1'));
      expect(h.options().summaryKey).not.toBe('thread-1:summary');
    }
  });

  it.each([
    ['another member', { threadId: 'thread-1', memberUid: 'member-2', email: 'ada@example.com' }],
    ['an AI search thread of another email', { threadId: 'thread-1', email: 'bob@example.com' }],
    ['a guest thread', { threadId: 'thread-1' }],
    ['a deleted own thread', { threadId: 'thread-1', email: 'ada@example.com', isDeleted: true }],
  ])('refuses %s with 404 THREAD_NOT_FOUND before the stream, with or without persist', async (_name, doc) => {
    for (const persist of [undefined, true]) {
      const h = setup(doc as ThreadDoc);
      const error = await h.chat({ ...VALID, persist });
      expect(body(error)).toEqual({ statusCode: 404, code: 'THREAD_NOT_FOUND', message: 'Thread not found' });
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
      expect(h.threads.warmSummary).not.toHaveBeenCalled();
    }
  });

  it('continues an own old AI search thread: its memory is loaded before the stream', async () => {
    const doc = { threadId: 'thread-1', email: 'ada@example.com', contextual: [] } as ThreadDoc;
    const h = setup(doc);
    h.threads.warmSummary.mockImplementation(async () => {
      expect(h.husky.createContextualToolsResponse).not.toHaveBeenCalled();
    });
    await h.chat({ ...VALID, persist: true });
    expect(h.threads.warmSummary).toHaveBeenCalledWith(doc, 'member-1');
    expect(h.options().persistHistory).toBe(true);
    expect(typeof h.options().persistTurn).toBe('function');
  });

  it('still answers when the memory load fails', async () => {
    const h = setup({ threadId: 'thread-1', memberUid: 'member-1' } as ThreadDoc);
    h.threads.warmSummary.mockRejectedValue(new Error('redis down'));
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    await h.chat({ ...VALID, persist: true });
    expect(h.husky.createContextualToolsResponse).toHaveBeenCalled();
  });

  it('saves a new thread turn with what the member saw, cards open, then sets the model title', async () => {
    const h = setup();
    // Lookups that need no extra fakes: the Home page and the job board item.
    const context = { page: 'home' };
    const mentions = [{ type: 'page', page: 'job' }];
    await h.chat({ ...VALID, persist: true, context, mentions });
    const options = h.options();
    // The cards of the turn: the same arrays the stream body ends with.
    options.extraResponseFields.proposals.push({ proposalId: 'ap_1', title: 'Update your Bio', expiresAt: 'x' });
    options.extraResponseFields.drafts.push({
      draftId: 'dr_1',
      text: 'Hello',
      target: { type: 'team', uid: 'team-1' },
    });
    const saved = finished();
    const bodyFields = options.turnFields(saved.summary);

    await options.persistTurn(saved);
    await new Promise((resolve) => setImmediate(resolve));

    expect(h.threads.appendTurn).toHaveBeenCalledTimes(1);
    const [target, header, turn] = h.threads.appendTurn.mock.calls[0];
    expect(target).toEqual({ threadId: 'thread-1', memberUid: 'member-1', email: 'ada@example.com', isNew: true });
    expect(header).toEqual({ title: 'Who works on storage?', context });
    expect(turn).toEqual({
      questionId: 'chat-1',
      question: 'Who works on storage?',
      response: 'Team A works on storage [1].',
      sources: bodyFields.sources,
      sourceRefs: bodyFields.sourceRefs ?? saved.tail.sourceRefs,
      actions: saved.tail.actions,
      followUpQuestions: saved.tail.followUpQuestions,
      createdAt: NOW,
      kind: 'agent',
      steps: saved.steps,
      context,
      mentions,
      proposals: [{ proposalId: 'ap_1', title: 'Update your Bio', expiresAt: 'x', status: 'open' }],
      drafts: [{ draftId: 'dr_1', text: 'Hello', target: { type: 'team', uid: 'team-1' }, status: 'open' }],
      toolCount: 1,
      usedWebSearch: false,
      sourceCount: bodyFields.sourceCount,
    });
    expect(h.husky.generateThreadTitle).toHaveBeenCalledWith('Who works on storage?');
    expect(h.threads.replaceTitle).toHaveBeenCalledWith('thread-1', 'Who works on storage?', 'Storage teams');
  });

  it('appends to an own thread with no new title', async () => {
    const h = setup({ threadId: 'thread-1', memberUid: 'member-1', title: 'Old' } as ThreadDoc);
    await h.chat({ ...VALID, persist: true });
    await h.options().persistTurn(finished());
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.threads.appendTurn.mock.calls[0][0]).toEqual(expect.objectContaining({ isNew: false }));
    expect(h.husky.generateThreadTitle).not.toHaveBeenCalled();
    expect(h.threads.replaceTitle).not.toHaveBeenCalled();
  });

  it('logs a fixed line and does not throw when the save fails', async () => {
    const h = setup();
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    h.threads.appendTurn.mockRejectedValue(new Error('mongo down: Who works on storage?'));
    await h.chat({ ...VALID, persist: true });
    await expect(h.options().persistTurn(finished())).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith('Failed to save a LabOS agent turn');
    expect(h.husky.generateThreadTitle).not.toHaveBeenCalled();
  });

  it('keeps the first-question title when the model gives none', async () => {
    const h = setup();
    h.husky.generateThreadTitle.mockResolvedValue('  ');
    await h.chat({ ...VALID, persist: true });
    await h.options().persistTurn(finished());
    await new Promise((resolve) => setImmediate(resolve));
    expect(h.threads.replaceTitle).not.toHaveBeenCalled();
  });

  it('accepts only a boolean persist', async () => {
    const h = setup();
    const error = await h.chat({ ...VALID, persist: 'yes' });
    expect(body(error)).toEqual(expect.objectContaining({ statusCode: 400, code: 'VALIDATION_ERROR' }));
  });
});

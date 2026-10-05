jest.mock('ai', () => ({ embed: jest.fn(), embedMany: jest.fn(), generateObject: jest.fn() }));
jest.mock('./job-openings-query.service', () => ({
  HIDDEN_JOB_OPENING_STATUSES: [
    'STALE',
    'CLOSED_DUPLICATE',
    'CLOSED_INCORRECT_SIGNAL',
    'CLOSED_NOT_HIRING_SIGNAL',
    'CLOSED_ROLE_FILLED',
  ],
}));

import { JobOpeningStatus } from '@prisma/client';
import { embed, embedMany, generateObject } from 'ai';
import type { AiProviderService } from '../shared/ai-provider.service';
import { PrismaService } from '../shared/prisma.service';
import {
  JobOpeningsSuggestedCandidatesComputeService,
  isDue,
} from './job-openings-suggested-candidates-compute.service';
import { buildRoleMatchText, hashMatchText } from './job-openings-suggested-candidates-match';

const embedMock = embed as jest.Mock;
const embedManyMock = embedMany as jest.Mock;
const generateObjectMock = generateObject as jest.Mock;

const CRITERIA = ['Rust', 'Senior', 'Remote EU', 'Distributed systems'];

type MemberSeed = {
  uid: string;
  vector: number[];
  company?: string;
  teamUid?: string;
};

const member = ({ uid, vector, company, teamUid }: MemberSeed) => ({
  uid,
  name: uid,
  role: 'Engineer',
  bio: null,
  customSkills: [],
  location: null,
  skills: [{ title: 'Rust' }],
  experiences: company ? [{ title: 'Engineer', company, description: null }] : [],
  teamMemberRoles: teamUid ? [{ teamUid }] : [],
  matchEmbedding: { model: 'gemini/text-embedding-004', contentHash: '', vector },
});

const role = (overrides: Record<string, unknown> = {}) => ({
  uid: 'job-1',
  status: JobOpeningStatus.NEW,
  teamUid: 'team-1',
  roleTitle: 'Senior Rust Engineer',
  roleCategory: 'Engineering',
  department: null,
  seniority: 'Senior',
  location: ['Remote'],
  workMode: 'Remote',
  summary: null,
  descriptionHtml: '<p>Build libp2p</p>',
  team: { uid: 'team-1', name: 'Acme' },
  candidateSuggestionSet: null,
  ...overrides,
});

describe('JobOpeningsSuggestedCandidatesComputeService', () => {
  const memberFindMany = jest.fn();
  const jobOpeningFindMany = jest.fn();
  const setUpsert = jest.fn((args) => ({ op: 'set.upsert', args }));
  const candidateDeleteMany = jest.fn((args) => ({ op: 'candidate.deleteMany', args }));
  const candidateCreateMany = jest.fn((args) => ({ op: 'candidate.createMany', args }));
  const setDeleteMany = jest.fn((args) => ({ op: 'set.deleteMany', args }));
  const embeddingUpsert = jest.fn((args) => ({ op: 'embedding.upsert', args }));
  const transaction = jest.fn();

  const prismaMock = {
    member: { findMany: memberFindMany },
    jobOpening: { findMany: jobOpeningFindMany },
    jobOpeningCandidateSuggestionSet: { upsert: setUpsert, deleteMany: setDeleteMany },
    jobOpeningSuggestedCandidate: { deleteMany: candidateDeleteMany, createMany: candidateCreateMany },
    memberMatchEmbedding: { upsert: embeddingUpsert },
    $transaction: transaction,
  } as unknown as PrismaService;

  const aiProviderMock = {
    getEmbeddingModel: jest.fn(() => ({ model: 'embedding-model', name: 'gemini/text-embedding-004' })),
    getResponsesModel: jest.fn(() => 'language-model'),
  } as unknown as AiProviderService;

  /** memberUid -> marks for CRITERIA, answered by the criteria check. */
  let checkAnswers: Record<string, boolean[]>;
  let service: JobOpeningsSuggestedCandidatesComputeService;

  const storedRows = () => {
    const ops = transaction.mock.calls
      .map(([ops]) => ops)
      .find((ops) => ops.some((op) => op.op === 'candidate.createMany'));
    return ops.find((op) => op.op === 'candidate.createMany').args.data;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    transaction.mockImplementation(async (ops) => ops.map(() => ({ count: 0 })));
    embedMock.mockResolvedValue({ embedding: [1, 0] });
    embedManyMock.mockImplementation(async ({ values }) => ({ embeddings: values.map(() => [0.5, 0.5]) }));
    checkAnswers = {};
    generateObjectMock.mockImplementation(async ({ prompt }) => {
      if (String(prompt).startsWith('Job:')) {
        const uids = [...String(prompt).matchAll(/memberUid: (\S+)/g)].map((match) => match[1]);
        return {
          object: {
            candidates: uids
              .filter((uid) => checkAnswers[uid])
              .map((uid) => ({ memberUid: uid, matched: checkAnswers[uid] })),
          },
        };
      }
      return { object: { criteria: CRITERIA } };
    });
    service = new JobOpeningsSuggestedCandidatesComputeService(prismaMock, aiProviderMock);
  });

  it('stores exactly 5 suggestions best first when at least 5 qualify, with criteria marks and labels', async () => {
    const seeds = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].map((uid, index) => ({ uid, vector: [1, index * 0.1] }));
    seeds.forEach(({ uid }) => (checkAnswers[uid] = [true, true, true, uid === 'm7']));
    checkAnswers.m7 = [true, true, true, true];
    checkAnswers.m6 = [true, false, false, false];
    const pool = seeds.map((seed) => ({ member: member(seed), text: seed.uid, vector: seed.vector }));

    await service.computeForRole(role(), pool, new Date('2026-10-05T12:00:00Z'));

    const rows = storedRows();
    expect(rows).toHaveLength(5);
    expect(rows.map((stored) => [stored.rank, stored.memberUid, stored.label])).toEqual([
      [1, 'm7', 'STRONG_MATCH'],
      [2, 'm1', 'GOOD_MATCH'],
      [3, 'm2', 'GOOD_MATCH'],
      [4, 'm3', 'GOOD_MATCH'],
      [5, 'm4', 'GOOD_MATCH'],
    ]);
    expect(rows[1].criteriaResults).toEqual([
      { criterion: 'Rust', matched: true },
      { criterion: 'Senior', matched: true },
      { criterion: 'Remote EU', matched: true },
      { criterion: 'Distributed systems', matched: false },
    ]);
    expect(setUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobOpeningUid: 'job-1' },
        create: expect.objectContaining({ criteria: CRITERIA, computedAt: new Date('2026-10-05T12:00:00Z') }),
      })
    );
    expect(candidateDeleteMany).toHaveBeenCalledWith({ where: { jobOpeningUid: 'job-1' } });
  });

  it('never checks or stores current members of the hiring team or people who worked there', async () => {
    const seeds: MemberSeed[] = [
      { uid: 'current', vector: [1, 0], teamUid: 'team-1' },
      { uid: 'alumni', vector: [1, 0], company: '  acme ' },
      { uid: 'outsider', vector: [0.9, 0.1], company: 'Other Co' },
    ];
    seeds.forEach(({ uid }) => (checkAnswers[uid] = [true, true, true, true]));
    const pool = seeds.map((seed) => ({ member: member(seed), text: seed.uid, vector: seed.vector }));

    await service.computeForRole(role(), pool);

    const checkPrompt = generateObjectMock.mock.calls
      .map(([args]) => String(args.prompt))
      .find((p) => p.startsWith('Job:'));
    expect(checkPrompt).toContain('memberUid: outsider');
    expect(checkPrompt).not.toContain('memberUid: current');
    expect(checkPrompt).not.toContain('memberUid: alumni');
    expect(storedRows().map((stored) => stored.memberUid)).toEqual(['outsider']);
  });

  it('stores only the members above the weak-match floor, without padding', async () => {
    const seeds = ['m1', 'm2', 'm3'].map((uid) => ({ uid, vector: [1, 0] }));
    checkAnswers = {
      m1: [true, true, false, false],
      m2: [true, false, false, false],
      m3: [false, false, false, false],
    };
    const pool = seeds.map((seed) => ({ member: member(seed), text: seed.uid, vector: seed.vector }));

    await service.computeForRole(role(), pool);

    expect(storedRows().map((stored) => [stored.memberUid, stored.label, stored.score])).toEqual([
      ['m1', 'GOOD_MATCH', 0.5],
    ]);
  });

  it('leaves out a member whose criteria answer is incomplete', async () => {
    const seeds = ['m1', 'm2'].map((uid) => ({ uid, vector: [1, 0] }));
    checkAnswers = { m1: [true, true, true], m2: [true, true, true, true] };
    const pool = seeds.map((seed) => ({ member: member(seed), text: seed.uid, vector: seed.vector }));

    await service.computeForRole(role(), pool);

    expect(storedRows().map((stored) => stored.memberUid)).toEqual(['m2']);
  });

  it('reuses stored criteria while the role text is unchanged', async () => {
    const current = role();
    const sourceHash = hashMatchText(buildRoleMatchText(current));
    const pool = [{ member: member({ uid: 'm1', vector: [1, 0] }), text: 'm1', vector: [1, 0] }];
    checkAnswers = { m1: [true, true] };

    await service.computeForRole(
      { ...current, candidateSuggestionSet: { criteria: ['Kept A', 'Kept B'], sourceHash, computedAt: new Date() } },
      pool
    );

    const prompts = generateObjectMock.mock.calls.map(([args]) => String(args.prompt));
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('1. Kept A');
  });

  describe('refreshDue', () => {
    it('clears non-live roles and recomputes only roles that are due', async () => {
      const now = new Date('2026-10-05T12:00:00Z');
      const fresh = role({ uid: 'fresh' });
      const freshSet = { criteria: CRITERIA, sourceHash: hashMatchText(buildRoleMatchText(fresh)), computedAt: now };
      jobOpeningFindMany.mockResolvedValue([{ ...fresh, candidateSuggestionSet: freshSet }, role({ uid: 'new' })]);
      memberFindMany.mockResolvedValue([member({ uid: 'm1', vector: [] })]);
      checkAnswers = { m1: [true, true, true, true] };

      const summary = await service.refreshDue(now);

      expect(summary).toMatchObject({ roles: 2, computed: 1, skipped: 1, failed: 0, embedded: 1 });
      expect(setDeleteMany).toHaveBeenCalledWith({
        where: { jobOpening: { OR: [{ status: { in: expect.any(Array) } }, { teamUid: null }] } },
      });
      expect(jobOpeningFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: { notIn: expect.any(Array) }, teamUid: { not: null } } })
      );
      expect(embeddingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'm1' }, update: expect.objectContaining({ vector: [0.5, 0.5] }) })
      );
      expect(setUpsert).toHaveBeenCalledTimes(1);
      expect(setUpsert.mock.calls[0][0].where).toEqual({ jobOpeningUid: 'new' });
    });

    it('keeps going when one role fails', async () => {
      jobOpeningFindMany.mockResolvedValue([role({ uid: 'a' }), role({ uid: 'b' })]);
      memberFindMany.mockResolvedValue([member({ uid: 'm1', vector: [] })]);
      embedMock.mockRejectedValueOnce(new Error('provider down'));

      const summary = await service.refreshDue();

      expect(summary).toMatchObject({ computed: 1, failed: 1 });
    });
  });

  describe('isDue', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    const current = role();
    const sourceHash = hashMatchText(buildRoleMatchText(current));

    it('is due without suggestions, after a text change, or after a day', () => {
      expect(isDue(current, now)).toBe(true);
      expect(isDue({ ...current, candidateSuggestionSet: { sourceHash: 'old', computedAt: now } }, now)).toBe(true);
      expect(
        isDue({ ...current, candidateSuggestionSet: { sourceHash, computedAt: new Date('2026-10-04T11:00:00Z') } }, now)
      ).toBe(true);
      expect(
        isDue({ ...current, candidateSuggestionSet: { sourceHash, computedAt: new Date('2026-10-05T01:00:00Z') } }, now)
      ).toBe(false);
    });
  });
});

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WarmIntrosV2Service } from './warm-intros-v2.service';
import { PrismaService } from '../shared/prisma.service';

describe('WarmIntrosV2Service', () => {
  let service: WarmIntrosV2Service;

  const edgeFindUnique = jest.fn();
  const edgeCreate = jest.fn();
  const edgeUpdate = jest.fn();
  const edgeFindMany = jest.fn();

  const pathFindUnique = jest.fn();
  const pathCreate = jest.fn();
  const pathUpdate = jest.fn();
  const pathFindMany = jest.fn();
  const pathCount = jest.fn();

  const masterProfileFindMany = jest.fn();
  const memberFindMany = jest.fn();

  const feedbackFindUnique = jest.fn();
  const feedbackFindMany = jest.fn();
  const feedbackCreate = jest.fn();
  const feedbackUpdate = jest.fn();
  const feedbackDelete = jest.fn();
  const feedbackCount = jest.fn();

  const transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      connectionEdge: { findUnique: edgeFindUnique, create: edgeCreate, update: edgeUpdate },
      warmPathV2: { findUnique: pathFindUnique, create: pathCreate, update: pathUpdate },
    })
  );

  const prismaMock = {
    $transaction: transaction,
    connectionEdge: {
      findUnique: edgeFindUnique,
      create: edgeCreate,
      update: edgeUpdate,
      findMany: edgeFindMany,
    },
    warmPathV2: {
      findUnique: pathFindUnique,
      create: pathCreate,
      update: pathUpdate,
      findMany: pathFindMany,
      count: pathCount,
    },
    warmPathV2Feedback: {
      findUnique: feedbackFindUnique,
      findMany: feedbackFindMany,
      create: feedbackCreate,
      update: feedbackUpdate,
      delete: feedbackDelete,
      count: feedbackCount,
    },
    masterProfile: {
      findMany: masterProfileFindMany,
    },
    member: {
      findMany: memberFindMany,
    },
  } as unknown as PrismaService;

  const hopChain = {
    hops: [
      { profileUid: 'from1', name: 'Juan Benet', role: 'pl_connector', score: 0.7 },
      { profileUid: 'inv1', name: 'Vitalik Buterin', role: 'investor' },
    ],
    reasons: [{ description: 'Shared Protocol Labs history' }],
    alternates: [{ profileUid: 'from2', name: 'Lacey Wisdom', score: 0.4 }],
    relationKind: 'pl_direct',
  };

  const pathRow = {
    uid: 'p1',
    targetProfileUid: 'inv1',
    targetSet: 'neuro-fund-i',
    rank: 1,
    score: 0.7,
    hopCount: 1,
    hopChain,
    bestConnectorProfileUid: 'from1',
    alternateConnectorProfileUids: ['from2'],
    runId: 'run-1',
    computedAt: new Date('2026-07-22T00:00:00.000Z'),
  };

  const investorProfile = {
    uid: 'inv1',
    personKey: 'email:vitalik@ethereum.org',
    canonicalName: 'Vitalik Buterin',
    emails: [{ value: 'vitalik@ethereum.org', sources: [{ type: 'affinity' }] }],
    currentOrg: 'Ethereum Foundation',
    currentTitle: 'Founder',
    investorMeta: { sectors: ['crypto', 'public-goods'] },
    affinityPersonId: '149762491',
    memberUid: null,
  };

  const connectorProfile = {
    uid: 'from1',
    personKey: 'affinity:254145996',
    canonicalName: 'Juan Benet',
    emails: [],
    currentOrg: 'Protocol Labs',
    currentTitle: 'Founder',
    investorMeta: null,
    affinityPersonId: '254145996',
    memberUid: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WarmIntrosV2Service(prismaMock);
    masterProfileFindMany.mockResolvedValue([investorProfile, connectorProfile]);
    memberFindMany.mockResolvedValue([]);
    pathCount.mockResolvedValue(1);
    feedbackFindMany.mockResolvedValue([]);
  });

  describe('ingestEdges', () => {
    it('rejects missing keys / non-finite score (whole batch)', async () => {
      await expect(
        service.ingestEdges({
          edges: [
            {
              fromProfileUid: '',
              toProfileUid: 'to1',
              relationKind: 'pl_direct',
              score: 0.9,
              confidence: 0.8,
              method: 'llm',
              reasons: [],
            },
          ],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.ingestEdges({
          edges: [
            {
              fromProfileUid: 'from1',
              toProfileUid: 'to1',
              relationKind: 'pl_direct',
              score: Number.NaN,
              confidence: 0.8,
              method: 'llm',
              reasons: [],
            },
          ],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('creates then updates by unique key and inherits batch runId', async () => {
      edgeFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'e1' });
      edgeCreate.mockResolvedValue({ uid: 'e1' });
      edgeUpdate.mockResolvedValue({ uid: 'e1' });

      const result = await service.ingestEdges({
        runId: 'run-1',
        edges: [
          {
            fromProfileUid: ' from1 ',
            toProfileUid: 'to1',
            relationKind: 'pl_direct',
            score: 0.9,
            confidence: 0.8,
            method: 'llm',
            reasons: [{ description: 'met at event' }],
            hintsUsed: { affinity: true },
          },
          {
            fromProfileUid: 'from1',
            toProfileUid: 'to1',
            relationKind: 'pl_direct',
            score: 0.95,
            confidence: 0.85,
            method: 'hybrid',
            reasons: [{ description: 'shared project' }],
            provider: 'gemini',
            model: 'gemini-2.5-flash',
          },
        ],
      });

      expect(edgeCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          fromProfileUid: 'from1',
          toProfileUid: 'to1',
          relationKind: 'pl_direct',
          score: 0.9,
          confidence: 0.8,
          method: 'llm',
          reasons: [{ description: 'met at event' }],
          hintsUsed: { affinity: true },
          runId: 'run-1',
        }),
      });
      expect(edgeUpdate).toHaveBeenCalledWith({
        where: {
          fromProfileUid_toProfileUid_relationKind: {
            fromProfileUid: 'from1',
            toProfileUid: 'to1',
            relationKind: 'pl_direct',
          },
        },
        data: expect.objectContaining({
          score: 0.95,
          method: 'hybrid',
          hintsUsed: Prisma.DbNull,
          provider: 'gemini',
          runId: 'run-1',
        }),
      });
      expect(result).toEqual({
        runId: 'run-1',
        received: 2,
        upserted: 2,
        created: 1,
        updated: 1,
      });
    });
  });

  describe('ingestPaths', () => {
    it('rejects missing target / non-integer rank (whole batch)', async () => {
      await expect(
        service.ingestPaths({
          paths: [
            {
              targetProfileUid: '',
              targetSet: 'neuro-fund-i',
              rank: 1,
              score: 0.9,
              hopCount: 1,
              hopChain: [],
            },
          ],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        service.ingestPaths({
          paths: [
            {
              targetProfileUid: 'inv1',
              targetSet: 'neuro-fund-i',
              rank: 1.5,
              score: 0.9,
              hopCount: 1,
              hopChain: [],
            },
          ],
        })
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(transaction).not.toHaveBeenCalled();
    });

    it('creates then updates by unique key', async () => {
      pathFindUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ uid: 'p1' });
      pathCreate.mockResolvedValue({ uid: 'p1' });
      pathUpdate.mockResolvedValue({ uid: 'p1' });

      const result = await service.ingestPaths({
        runId: 'run-2',
        paths: [
          {
            targetProfileUid: ' inv1 ',
            targetSet: 'neuro-fund-i',
            rank: 1,
            score: 0.9,
            hopCount: 1,
            hopChain: [{ uid: 'from1' }, { uid: 'inv1' }],
            bestConnectorProfileUid: 'from1',
            computedAt: '2026-07-22T00:00:00.000Z',
          },
          {
            targetProfileUid: 'inv1',
            targetSet: 'neuro-fund-i',
            rank: 1,
            score: 0.95,
            hopCount: 1,
            hopChain: [{ uid: 'from2' }, { uid: 'inv1' }],
            bestConnectorProfileUid: 'from2',
            alternateConnectorProfileUids: ['from1'],
          },
        ],
      });

      expect(pathCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          targetProfileUid: 'inv1',
          targetSet: 'neuro-fund-i',
          rank: 1,
          score: 0.9,
          hopCount: 1,
          bestConnectorProfileUid: 'from1',
          runId: 'run-2',
          computedAt: new Date('2026-07-22T00:00:00.000Z'),
        }),
      });
      expect(pathUpdate).toHaveBeenCalledWith({
        where: {
          targetProfileUid_targetSet_rank: {
            targetProfileUid: 'inv1',
            targetSet: 'neuro-fund-i',
            rank: 1,
          },
        },
        data: expect.objectContaining({
          score: 0.95,
          bestConnectorProfileUid: 'from2',
          alternateConnectorProfileUids: ['from1'],
          runId: 'run-2',
        }),
      });
      expect(result).toEqual({
        runId: 'run-2',
        received: 2,
        upserted: 2,
        created: 1,
        updated: 1,
      });
    });
  });

  describe('listPaths', () => {
    it('defaults rank=1 and minScore=0.2, enriches investor email from Sourced[], returns total', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        connectorProfileUid: 'from1',
        limit: '10',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: {
          rank: 1,
          targetSet: 'neuro-fund-i',
          score: { gte: 0.2 },
          OR: [{ bestConnectorProfileUid: 'from1' }, { alternateConnectorProfileUids: { array_contains: 'from1' } }],
        },
        take: 10,
        skip: 0,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
      });
      expect(masterProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uid: { in: expect.arrayContaining(['inv1', 'from1']) } },
        })
      );

      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatchObject({
        uid: 'p1',
        proximityCode: 'PL+1A',
        caliber: 'A',
        scorePercent: 70,
        scoreBand: 'green',
        investor: {
          profileUid: 'inv1',
          name: 'Vitalik Buterin',
          email: 'vitalik@ethereum.org',
          sectors: ['crypto', 'public-goods'],
        },
        bestConnector: {
          profileUid: 'from1',
          name: 'Juan Benet',
        },
      });
    });

    it('honors explicit minScore override', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        connectorProfileUid: 'from1',
        minScore: '0.5',
        limit: '10',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: {
          rank: 1,
          targetSet: 'neuro-fund-i',
          score: { gte: 0.5 },
          OR: [{ bestConnectorProfileUid: 'from1' }, { alternateConnectorProfileUids: { array_contains: 'from1' } }],
        },
        take: 10,
        skip: 0,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
      });
      expect(masterProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { uid: { in: expect.arrayContaining(['inv1', 'from1']) } },
        })
      );

      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatchObject({
        uid: 'p1',
        proximityCode: 'PL+1A',
        caliber: 'A',
        scorePercent: 70,
        scoreBand: 'green',
        investor: {
          profileUid: 'inv1',
          name: 'Vitalik Buterin',
          email: 'vitalik@ethereum.org',
          sectors: ['crypto', 'public-goods'],
        },
        bestConnector: {
          profileUid: 'from1',
          name: 'Juan Benet',
        },
        pathSummary: {
          explanation: 'Shared Protocol Labs history',
          alternateCount: 1,
        },
      });
    });

    it('filters by search name (case-insensitive)', async () => {
      const other = {
        ...pathRow,
        uid: 'p2',
        targetProfileUid: 'inv2',
        score: 0.4,
        hopChain: { ...hopChain, relationKind: 'pl_direct' },
        bestConnectorProfileUid: 'from1',
      };
      pathFindMany.mockResolvedValue([pathRow, other]);
      masterProfileFindMany.mockResolvedValue([
        investorProfile,
        connectorProfile,
        {
          uid: 'inv2',
          personKey: 'email:other@example.com',
          canonicalName: 'Alice Other',
          emails: [{ value: 'other@example.com', sources: [] }],
          currentOrg: null,
          currentTitle: null,
          investorMeta: { sectors: ['ai'] },
          affinityPersonId: null,
          memberUid: null,
        },
      ]);

      const result = await service.listPaths({ search: 'vitalik', limit: '50' });

      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].investor.name).toBe('Vitalik Buterin');
      // Post-filter path: no take/skip on findMany
      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rank: 1, score: { gte: 0.2 } },
          orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
        })
      );
      expect(pathFindMany.mock.calls[0][0].take).toBeUndefined();
    });

    it('filters by sector', async () => {
      const other = {
        ...pathRow,
        uid: 'p2',
        targetProfileUid: 'inv2',
        score: 0.4,
      };
      pathFindMany.mockResolvedValue([pathRow, other]);
      masterProfileFindMany.mockResolvedValue([
        investorProfile,
        connectorProfile,
        {
          uid: 'inv2',
          personKey: 'k2',
          canonicalName: 'Alice Other',
          emails: [],
          currentOrg: null,
          currentTitle: null,
          investorMeta: { sectors: ['biotech'] },
          affinityPersonId: null,
          memberUid: null,
        },
      ]);

      const result = await service.listPaths({ sector: 'crypto' });
      expect(result.total).toBe(1);
      expect(result.paths[0].investor.sectors).toContain('crypto');
    });

    it('collapses multi-list investor to one row when targetSet is omitted (All)', async () => {
      const goldPath = {
        ...pathRow,
        uid: 'p-gold',
        targetSet: 'gold-co-investors',
        score: 0.65,
      };
      // Score-desc order as Prisma returns: neuro (0.7) before gold (0.65).
      pathFindMany.mockResolvedValue([pathRow, goldPath]);

      const result = await service.listPaths({ limit: '50', offset: '0' });

      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rank: 1, score: { gte: 0.2 } },
          orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
        })
      );
      expect(pathFindMany.mock.calls[0][0].take).toBeUndefined();
      expect(pathCount).not.toHaveBeenCalled();
      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0]).toMatchObject({
        uid: 'p1',
        targetProfileUid: 'inv1',
        targetSet: 'neuro-fund-i',
        score: 0.7,
      });
    });

    it('does not collapse when targetSet is scoped to one list', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        limit: '50',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: { rank: 1, targetSet: 'neuro-fund-i', score: { gte: 0.2 } },
        take: 50,
        skip: 0,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
      });
      expect(pathCount).toHaveBeenCalledWith({
        where: { rank: 1, targetSet: 'neuro-fund-i', score: { gte: 0.2 } },
      });
      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].uid).toBe('p1');
      expect(result.paths[0].targetSet).toBe('neuro-fund-i');
    });

    it('applies directOnly as a relationKind=pl_direct hopChain filter (folded in, single-value fast path)', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      await service.listPaths({
        targetSet: 'neuro-fund-i',
        directOnly: 'true',
        limit: '50',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: {
          rank: 1,
          targetSet: 'neuro-fund-i',
          score: { gte: 0.2 },
          hopChain: { path: ['relationKind'], equals: 'pl_direct' },
        },
        take: 50,
        skip: 0,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
      });
    });

    it('directOnly is ignored once an explicit relationKind is given (relationKind wins)', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      await service.listPaths({
        targetSet: 'neuro-fund-i',
        directOnly: 'true',
        relationKind: 'founder_bridge',
        limit: '50',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ hopChain: { path: ['relationKind'], equals: 'founder_bridge' } }),
        })
      );
    });

    it('OR-matches multiple relationKind values via post-filter over the full candidate set', async () => {
      const bridgeRow = {
        ...pathRow,
        uid: 'p2',
        targetProfileUid: 'inv2',
        hopChain: {
          relationKind: 'founder_bridge',
          hops: [
            { profileUid: 'from1', name: 'Juan Benet', role: 'pl_connector' },
            { profileUid: 'bridge1', name: 'Bridget Founder', role: 'founder' },
            { profileUid: 'inv2', name: 'Alice', role: 'investor' },
          ],
        },
      };
      pathFindMany.mockResolvedValue([pathRow, bridgeRow]);
      masterProfileFindMany.mockResolvedValue([investorProfile, connectorProfile]);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        relationKind: 'pl_direct,founder_bridge',
        limit: '50',
        offset: '0',
      });

      // 2+ values drop the where-clause fast path — no hopChain key in the query.
      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.not.objectContaining({ hopChain: expect.anything() }) })
      );
      expect(result.paths.map((p) => p.uid)).toEqual(['p1', 'p2']);
    });

    it('filters by bridgeProfileUid via post-filter (no queryable column exists)', async () => {
      const bridgeRow = {
        ...pathRow,
        uid: 'p2',
        targetProfileUid: 'inv2',
        hopChain: {
          relationKind: 'founder_bridge',
          hops: [
            { profileUid: 'from1', name: 'Juan Benet', role: 'pl_connector' },
            { profileUid: 'bridge1', name: 'Bridget Founder', role: 'founder' },
            { profileUid: 'inv2', name: 'Alice', role: 'investor' },
          ],
        },
      };
      pathFindMany.mockResolvedValue([pathRow, bridgeRow]);
      masterProfileFindMany.mockResolvedValue([investorProfile, connectorProfile]);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        bridgeProfileUid: 'bridge1',
        limit: '50',
        offset: '0',
      });

      expect(result.paths.map((p) => p.uid)).toEqual(['p2']);
    });

    it('applies relationKind as hopChain JSON path filter', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      await service.listPaths({
        targetSet: 'neuro-fund-i',
        relationKind: 'founder_bridge',
        limit: '50',
        offset: '0',
      });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: {
          rank: 1,
          targetSet: 'neuro-fund-i',
          score: { gte: 0.2 },
          hopChain: { path: ['relationKind'], equals: 'founder_bridge' },
        },
        take: 50,
        skip: 0,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
      });
    });

    it('rejects invalid relationKind', async () => {
      await expect(service.listPaths({ relationKind: 'nope' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('post-filters plBacker=true to investors with plBacking', async () => {
      const other = {
        ...pathRow,
        uid: 'p2',
        targetProfileUid: 'inv2',
        score: 0.4,
      };
      pathFindMany.mockResolvedValue([pathRow, other]);
      masterProfileFindMany.mockResolvedValue([
        {
          ...investorProfile,
          plBacking: { backedProtocolLabs: true, backedFilecoin: false, matchKind: 'person' },
        },
        connectorProfile,
        {
          uid: 'inv2',
          personKey: 'k2',
          canonicalName: 'Alice Other',
          emails: [],
          currentOrg: null,
          currentTitle: null,
          investorMeta: null,
          affinityPersonId: null,
          memberUid: null,
          plBacking: null,
        },
      ]);

      const result = await service.listPaths({ plBacker: 'true', limit: '50' });
      expect(result.total).toBe(1);
      expect(result.paths).toHaveLength(1);
      expect(result.paths[0].investor.profileUid).toBe('inv1');
      expect(result.paths[0].investor.plBacking).toMatchObject({ backedProtocolLabs: true });
      expect(pathFindMany.mock.calls[0][0].take).toBeUndefined();
    });

    it('enriches hop memberUid/imageUrl on list rows', async () => {
      masterProfileFindMany.mockResolvedValue([
        { ...investorProfile, memberUid: 'mem-inv' },
        { ...connectorProfile, memberUid: 'mem-juan' },
      ]);
      memberFindMany.mockResolvedValue([
        { uid: 'mem-juan', image: { url: 'https://cdn.example/juan.png' } },
        { uid: 'mem-inv', image: { url: 'https://cdn.example/vitalik.png' } },
      ]);
      pathFindMany.mockResolvedValue([pathRow]);
      pathCount.mockResolvedValue(1);

      const result = await service.listPaths({
        targetSet: 'neuro-fund-i',
        limit: '50',
        offset: '0',
      });

      const hops = (result.paths[0].hopChain as { hops: Array<Record<string, unknown>> }).hops;
      expect(hops[0]).toMatchObject({
        profileUid: 'from1',
        memberUid: 'mem-juan',
        imageUrl: 'https://cdn.example/juan.png',
      });
      expect(hops[1]).toMatchObject({
        profileUid: 'inv1',
        memberUid: 'mem-inv',
        imageUrl: 'https://cdn.example/vitalik.png',
      });
    });
  });

  describe('getPathsByInvestor', () => {
    it('returns empty enriched payload when none', async () => {
      pathFindMany.mockResolvedValue([]);
      masterProfileFindMany.mockResolvedValue([]);
      await expect(service.getPathsByInvestor('inv1', {})).resolves.toEqual({
        paths: [],
        investor: expect.objectContaining({ profileUid: 'inv1', name: 'inv1' }),
      });
      expect(pathFindMany).toHaveBeenCalledWith({
        where: { targetProfileUid: 'inv1', score: { gte: 0.2 } },
        orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
      });
    });

    it('enriches detail paths with proximity + investor summary', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      feedbackFindMany.mockResolvedValue([]);
      const result = await service.getPathsByInvestor('inv1', {});
      expect(result.investor.email).toBe('vitalik@ethereum.org');
      expect(result.paths[0].proximityCode).toBe('PL+1A');
      expect(result.paths[0].bestConnector?.name).toBe('Juan Benet');
    });

    it('attaches myFeedback and feedbackSummary when requested', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      feedbackFindMany
        .mockResolvedValueOnce([
          {
            warmPathUid: 'p1',
            connectorProfileUid: 'from1',
            canRefer: 'yes',
            note: 'Solid',
            updatedAt: new Date('2026-07-28T00:00:00.000Z'),
          },
        ])
        .mockResolvedValueOnce([
          {
            warmPathUid: 'p1',
            connectorProfileUid: 'from1',
            canRefer: 'yes',
            note: 'Solid',
            actorEmail: 'a@pl.com',
            updatedAt: new Date('2026-07-28T00:00:00.000Z'),
          },
          {
            warmPathUid: 'p1',
            connectorProfileUid: 'from1',
            canRefer: 'no',
            note: null,
            actorEmail: 'b@pl.com',
            updatedAt: new Date('2026-07-27T00:00:00.000Z'),
          },
        ]);

      const result = await service.getPathsByInvestor(
        'inv1',
        {},
        {
          actor: { uid: 'member-1', email: 'a@pl.com' },
          includeFeedbackSummary: true,
        }
      );

      expect(result.paths[0].myFeedbackByConnector).toEqual({
        from1: {
          canRefer: 'yes',
          note: 'Solid',
          updatedAt: '2026-07-28T00:00:00.000Z',
        },
      });
      expect(result.paths[0].feedbackSummaryByConnector?.from1).toEqual(
        expect.objectContaining({ yesCount: 1, noCount: 1, noteCount: 1 })
      );
    });
  });

  describe('upsertPathFeedback', () => {
    it('creates feedback for a connector on the path', async () => {
      pathFindUnique.mockResolvedValue({
        uid: 'p1',
        targetProfileUid: 'inv1',
        targetSet: 'neuro-fund-i',
        bestConnectorProfileUid: 'from1',
        alternateConnectorProfileUids: ['from2'],
        hopChain,
      });
      feedbackFindUnique.mockResolvedValue(null);
      feedbackCreate.mockResolvedValue({
        uid: 'f1',
        warmPathUid: 'p1',
        targetProfileUid: 'inv1',
        targetSet: 'neuro-fund-i',
        connectorProfileUid: 'from1',
        canRefer: 'yes',
        note: null,
        actorUid: 'member-1',
        actorEmail: 'a@pl.com',
        createdAt: new Date('2026-07-28T00:00:00.000Z'),
        updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      });

      await expect(
        service.upsertPathFeedback(
          'p1',
          { connectorProfileUid: 'from1', canRefer: 'yes' },
          { uid: 'member-1', email: 'a@pl.com' }
        )
      ).resolves.toEqual(expect.objectContaining({ uid: 'f1', canRefer: 'yes', connectorProfileUid: 'from1' }));
      expect(feedbackCreate).toHaveBeenCalled();
    });

    it('rejects connector not on path', async () => {
      pathFindUnique.mockResolvedValue({
        uid: 'p1',
        targetProfileUid: 'inv1',
        targetSet: 'neuro-fund-i',
        bestConnectorProfileUid: 'from1',
        alternateConnectorProfileUids: [],
        hopChain,
      });
      await expect(
        service.upsertPathFeedback(
          'p1',
          { connectorProfileUid: 'unknown', canRefer: 'yes' },
          { uid: 'member-1', email: 'a@pl.com' }
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getMyPathFeedback', () => {
    const pathOnDisk = {
      uid: 'p1',
      bestConnectorProfileUid: 'from1',
      alternateConnectorProfileUids: ['from2'],
      hopChain,
    };

    it('returns this actor note', async () => {
      pathFindUnique.mockResolvedValue(pathOnDisk);
      feedbackFindUnique.mockResolvedValue({
        note: 'Wrong connector',
        updatedAt: new Date('2026-07-28T00:00:00.000Z'),
      });

      await expect(service.getMyPathFeedback('p1', 'from1', { uid: 'member-1', email: 'a@pl.com' })).resolves.toEqual({
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
        note: 'Wrong connector',
        updatedAt: '2026-07-28T00:00:00.000Z',
      });
    });

    it('returns empty when this actor has no note', async () => {
      pathFindUnique.mockResolvedValue(pathOnDisk);
      feedbackFindUnique.mockResolvedValue(null);

      await expect(service.getMyPathFeedback('p1', 'from1', { uid: 'member-1', email: 'a@pl.com' })).resolves.toEqual({
        warmPathUid: 'p1',
        connectorProfileUid: 'from1',
        note: null,
        updatedAt: null,
      });
    });

    it('throws not-found when the path is missing', async () => {
      pathFindUnique.mockResolvedValue(null);
      await expect(
        service.getMyPathFeedback('missing', 'from1', { uid: 'member-1', email: 'a@pl.com' })
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('listFacets', () => {
    it('lists all pl_internal connectors (not only best) + sectors + path-kind + bridge-person counts', async () => {
      pathFindMany.mockResolvedValue([
        {
          targetProfileUid: 'inv1',
          bestConnectorProfileUid: 'from1',
          hopChain: { relationKind: 'pl_direct' },
        },
        {
          targetProfileUid: 'inv2',
          bestConnectorProfileUid: 'from1',
          hopChain: {
            relationKind: 'founder_bridge',
            hops: [
              { profileUid: 'from1', role: 'pl_connector' },
              { profileUid: 'bridge1', role: 'founder' },
              { profileUid: 'inv2', role: 'investor' },
            ],
          },
        },
      ]);
      // 1st call: pl_internal roster; 2nd: bridge-person profiles; 3rd: investor profiles for sectors
      masterProfileFindMany
        .mockResolvedValueOnce([
          { uid: 'from1', canonicalName: 'Juan Benet' },
          { uid: 'from2', canonicalName: 'Lacey Wisdom' },
          { uid: 'from3', canonicalName: 'Marc Johnson' },
        ])
        .mockResolvedValueOnce([{ uid: 'bridge1', canonicalName: 'Bridget Founder' }])
        .mockResolvedValueOnce([
          investorProfile,
          {
            uid: 'inv2',
            personKey: 'k2',
            canonicalName: 'Alice',
            emails: [],
            investorMeta: { sectors: ['crypto', 'ai'] },
            currentOrg: null,
            currentTitle: null,
            affinityPersonId: null,
            memberUid: null,
          },
        ]);

      const result = await service.listFacets({ targetSet: 'neuro-fund-i' });
      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { rank: 1, targetSet: 'neuro-fund-i', score: { gte: 0.2 } },
        })
      );
      expect(result.connectors).toEqual([
        { profileUid: 'from1', name: 'Juan Benet', pathCount: 2 },
        { profileUid: 'from2', name: 'Lacey Wisdom', pathCount: 0 },
        { profileUid: 'from3', name: 'Marc Johnson', pathCount: 0 },
      ]);
      expect(result.kinds).toEqual(
        expect.arrayContaining([
          { value: 'pl_direct', count: 1 },
          { value: 'founder_bridge', count: 1 },
        ])
      );
      expect(result.bridges).toEqual([{ profileUid: 'bridge1', name: 'Bridget Founder', pathCount: 1 }]);
      expect(result.sectors).toEqual(
        expect.arrayContaining([
          { value: 'crypto', count: 2 },
          { value: 'public-goods', count: 1 },
          { value: 'ai', count: 1 },
        ])
      );
      expect(result.plBackerCount).toBe(0);
      expect(masterProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { types: { has: 'pl_internal' } } })
      );
    });

    it('falls back to pl_direct and no bridges when hopChain has no relationKind', async () => {
      pathFindMany.mockResolvedValue([{ targetProfileUid: 'inv1', bestConnectorProfileUid: 'from1', hopChain: null }]);
      masterProfileFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const result = await service.listFacets({});
      expect(result.kinds).toEqual([{ value: 'pl_direct', count: 1 }]);
      expect(result.bridges).toEqual([]);
    });

    it('counts investors with plBacking set', async () => {
      pathFindMany.mockResolvedValue([
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'from1', hopChain: { relationKind: 'pl_direct' } },
        { targetProfileUid: 'inv2', bestConnectorProfileUid: 'from1', hopChain: { relationKind: 'pl_direct' } },
      ]);
      masterProfileFindMany
        .mockResolvedValueOnce([]) // pl_internal roster
        .mockResolvedValueOnce([
          { ...investorProfile, plBacking: { backedProtocolLabs: true, backedFilecoin: false, matchKind: 'person' } },
          { uid: 'inv2', personKey: 'k2', canonicalName: 'Alice', plBacking: null },
        ]);

      const result = await service.listFacets({ targetSet: 'neuro-fund-i' });
      expect(result.plBackerCount).toBe(1);
    });

    it('collapses a duplicate investor across target sets so the connector is not double-counted (targetSet omitted / All)', async () => {
      pathFindMany.mockResolvedValue([
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'from1', hopChain: { relationKind: 'pl_direct' } },
        {
          targetProfileUid: 'inv1',
          bestConnectorProfileUid: 'from1',
          hopChain: { relationKind: 'pl_direct' },
        },
      ]);
      masterProfileFindMany
        .mockResolvedValueOnce([{ uid: 'from1', canonicalName: 'Juan Benet' }]) // pl_internal roster
        .mockResolvedValueOnce([investorProfile]); // investor profiles for sectors

      const result = await service.listFacets({});
      expect(pathFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }, { uid: 'asc' }],
        })
      );
      expect(result.connectors).toEqual([{ profileUid: 'from1', name: 'Juan Benet', pathCount: 1 }]);
      expect(result.sectors).toEqual(
        expect.arrayContaining([
          { value: 'crypto', count: 1 },
          { value: 'public-goods', count: 1 },
        ])
      );
    });

    it('keeps only the higher-score row for a duplicate investor, across connectors/kinds/bridges/sectors', async () => {
      // Score-desc + uid-asc order as Prisma would return per orderBy: the bridge row (from2) wins.
      pathFindMany.mockResolvedValue([
        {
          targetProfileUid: 'inv1',
          bestConnectorProfileUid: 'from2',
          hopChain: {
            relationKind: 'founder_bridge',
            hops: [
              { profileUid: 'from2', role: 'pl_connector' },
              { profileUid: 'bridge1', role: 'founder' },
              { profileUid: 'inv1', role: 'investor' },
            ],
          },
        },
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'from1', hopChain: { relationKind: 'pl_direct' } },
      ]);
      masterProfileFindMany
        .mockResolvedValueOnce([
          { uid: 'from1', canonicalName: 'Juan Benet' },
          { uid: 'from2', canonicalName: 'Lacey Wisdom' },
        ]) // pl_internal roster
        .mockResolvedValueOnce([{ uid: 'bridge1', canonicalName: 'Bridget Founder' }]) // bridge-person profiles
        .mockResolvedValueOnce([investorProfile]); // investor profiles for sectors

      const result = await service.listFacets({});
      expect(result.connectors).toEqual(
        expect.arrayContaining([
          { profileUid: 'from2', name: 'Lacey Wisdom', pathCount: 1 },
          { profileUid: 'from1', name: 'Juan Benet', pathCount: 0 },
        ])
      );
      expect(result.kinds).toEqual([{ value: 'founder_bridge', count: 1 }]);
      expect(result.bridges).toEqual([{ profileUid: 'bridge1', name: 'Bridget Founder', pathCount: 1 }]);
      expect(result.sectors).toEqual(
        expect.arrayContaining([
          { value: 'crypto', count: 1 },
          { value: 'public-goods', count: 1 },
        ])
      );
    });

    it('excludes self-referential paths from every facet when targetSet is omitted (All)', async () => {
      pathFindMany.mockResolvedValue([
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'inv1', hopChain: { relationKind: 'pl_direct' } },
      ]);
      masterProfileFindMany.mockResolvedValueOnce([{ uid: 'from1', canonicalName: 'Juan Benet' }]);

      const result = await service.listFacets({});
      expect(result.connectors).toEqual([{ profileUid: 'from1', name: 'Juan Benet', pathCount: 0 }]);
      expect(result.kinds).toEqual([]);
      expect(result.bridges).toEqual([]);
      expect(result.sectors).toEqual([]);
      expect(result.plBackerCount).toBe(0);
    });

    it('excludes self-referential paths even with an explicit targetSet (not just All)', async () => {
      pathFindMany.mockResolvedValue([
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'inv1', hopChain: { relationKind: 'pl_direct' } },
      ]);
      masterProfileFindMany.mockResolvedValueOnce([]);

      const result = await service.listFacets({ targetSet: 'neuro-fund-i' });
      expect(result.connectors).toEqual([]);
      expect(result.sectors).toEqual([]);
      expect(result.plBackerCount).toBe(0);
    });
  });

  describe('listEdges', () => {
    it('filters optional fields and caps limit', async () => {
      edgeFindMany.mockResolvedValue([{ uid: 'e1' }]);
      await expect(
        service.listEdges({
          fromProfileUid: 'from1',
          relationKind: 'pl_direct',
          limit: '999',
        })
      ).resolves.toEqual({ edges: [{ uid: 'e1' }] });
      expect(edgeFindMany).toHaveBeenCalledWith({
        where: { fromProfileUid: 'from1', relationKind: 'pl_direct' },
        take: 200,
        skip: 0,
        orderBy: { uid: 'asc' },
      });
    });
  });
});

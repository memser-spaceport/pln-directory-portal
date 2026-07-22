import { BadRequestException } from '@nestjs/common';
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
    it('defaults rank=1, enriches investor email from Sourced[], returns total', async () => {
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
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
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
          where: { rank: 1 },
          orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
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
        where: { targetProfileUid: 'inv1' },
        orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
      });
    });

    it('enriches detail paths with proximity + investor summary', async () => {
      pathFindMany.mockResolvedValue([pathRow]);
      const result = await service.getPathsByInvestor('inv1', {});
      expect(result.investor.email).toBe('vitalik@ethereum.org');
      expect(result.paths[0].proximityCode).toBe('PL+1A');
      expect(result.paths[0].bestConnector?.name).toBe('Juan Benet');
    });
  });

  describe('listFacets', () => {
    it('lists all pl_internal connectors (not only best) + sectors', async () => {
      pathFindMany.mockResolvedValue([
        { targetProfileUid: 'inv1', bestConnectorProfileUid: 'from1' },
        { targetProfileUid: 'inv2', bestConnectorProfileUid: 'from1' },
      ]);
      // 1st call: pl_internal roster; 2nd: investor profiles for sectors
      masterProfileFindMany
        .mockResolvedValueOnce([
          { uid: 'from1', canonicalName: 'Juan Benet' },
          { uid: 'from2', canonicalName: 'Lacey Wisdom' },
          { uid: 'from3', canonicalName: 'Marc Johnson' },
        ])
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
      expect(result.connectors).toEqual([
        { profileUid: 'from1', name: 'Juan Benet', pathCount: 2 },
        { profileUid: 'from2', name: 'Lacey Wisdom', pathCount: 0 },
        { profileUid: 'from3', name: 'Marc Johnson', pathCount: 0 },
      ]);
      expect(result.sectors).toEqual(
        expect.arrayContaining([
          { value: 'crypto', count: 2 },
          { value: 'public-goods', count: 1 },
          { value: 'ai', count: 1 },
        ])
      );
      expect(masterProfileFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { types: { has: 'pl_internal' } } })
      );
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
        orderBy: { updatedAt: 'desc' },
      });
    });
  });
});

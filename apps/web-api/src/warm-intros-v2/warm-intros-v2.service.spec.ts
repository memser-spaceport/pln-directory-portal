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
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new WarmIntrosV2Service(prismaMock);
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
    it('defaults rank=1 and applies filters', async () => {
      pathFindMany.mockResolvedValue([{ uid: 'p1' }]);
      await expect(
        service.listPaths({
          targetSet: 'neuro-fund-i',
          connectorProfileUid: 'from1',
          minScore: '0.5',
          limit: '10',
          offset: '5',
        })
      ).resolves.toEqual({ paths: [{ uid: 'p1' }] });

      expect(pathFindMany).toHaveBeenCalledWith({
        where: {
          rank: 1,
          targetSet: 'neuro-fund-i',
          score: { gte: 0.5 },
          OR: [{ bestConnectorProfileUid: 'from1' }, { alternateConnectorProfileUids: { array_contains: 'from1' } }],
        },
        take: 10,
        skip: 5,
        orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
      });
    });
  });

  describe('getPathsByInvestor', () => {
    it('returns empty array when none', async () => {
      pathFindMany.mockResolvedValue([]);
      await expect(service.getPathsByInvestor('inv1', {})).resolves.toEqual({ paths: [] });
      expect(pathFindMany).toHaveBeenCalledWith({
        where: { targetProfileUid: 'inv1' },
        orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
      });
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

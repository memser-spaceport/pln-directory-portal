import { BadRequestException } from '@nestjs/common';
import { PathfinderQueryService } from './pathfinder-query.service';
import { PrismaService } from '../shared/prisma.service';

describe('PathfinderQueryService', () => {
  let service: PathfinderQueryService;
  const queryRaw = jest.fn();
  const transaction = jest.fn();
  const memberFindMany = jest.fn();
  const pathFindMany = jest.fn();
  const correctionFindMany = jest.fn();
  const prismaMock = {
    $queryRaw: queryRaw,
    $transaction: transaction,
    member: { findMany: memberFindMany },
    pathfinderPath: { findMany: pathFindMany },
    pathfinderCorrection: { findMany: correctionFindMany },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PathfinderQueryService(prismaMock);
  });

  describe('getPathsForTarget', () => {
    it('hydrates missing imageUrl from Member.image.url', async () => {
      transaction.mockResolvedValue([
        [
          {
            id: 1,
            targetInvestorId: 'inv-1',
            hopChain: {
              contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a' },
              routeNodes: [{ label: 'Alice', variant: 'member', memberUid: 'uid-a' }],
            },
          },
        ],
        [],
      ]);
      memberFindMany.mockResolvedValue([{ uid: 'uid-a', image: { url: 'https://img/a.webp' } }]);

      const result = await service.getPathsForTarget('inv-1');

      expect(memberFindMany).toHaveBeenCalledWith({
        where: { uid: { in: ['uid-a'] } },
        select: { uid: true, image: { select: { url: true } } },
      });
      expect(result.items[0].hopChain).toEqual({
        contact: { name: 'Alice', role: 'Founder', memberUid: 'uid-a', imageUrl: 'https://img/a.webp' },
        routeNodes: [{ label: 'Alice', variant: 'member', memberUid: 'uid-a', imageUrl: 'https://img/a.webp' }],
      });
      expect(result.items[0].corrections).toEqual([]);
    });

    it('skips member lookup when every person already has imageUrl', async () => {
      transaction.mockResolvedValue([
        [
          {
            id: 2,
            targetInvestorId: 'inv-2',
            hopChain: {
              contact: {
                name: 'Alice',
                role: 'Founder',
                memberUid: 'uid-a',
                imageUrl: 'https://img/kept.webp',
              },
            },
          },
        ],
        [],
      ]);

      const result = await service.getPathsForTarget('inv-2');

      expect(memberFindMany).not.toHaveBeenCalled();
      expect(result.items[0].hopChain).toEqual({
        contact: {
          name: 'Alice',
          role: 'Founder',
          memberUid: 'uid-a',
          imageUrl: 'https://img/kept.webp',
        },
      });
    });
  });

  describe('connectorMatches', () => {
    it('returns empty when ids or labels are missing', async () => {
      await expect(service.connectorMatches({ target_investor_ids: [], connector_labels: ['a'] })).resolves.toEqual({
        matchedIds: [],
      });
      await expect(service.connectorMatches({ target_investor_ids: ['inv-1'], connector_labels: [] })).resolves.toEqual(
        {
          matchedIds: [],
        }
      );
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('queries exact labels', async () => {
      queryRaw.mockResolvedValue([{ targetInvestorId: 'inv-1' }]);

      const result = await service.connectorMatches({
        target_investor_ids: ['inv-1'],
        connector_labels: ['Alice Founder'],
      });

      expect(result).toEqual({ matchedIds: ['inv-1'] });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('queries contains labels when exact labels are empty', async () => {
      queryRaw.mockResolvedValue([{ targetInvestorId: 'inv-2' }]);

      const result = await service.connectorMatches({
        target_investor_ids: ['inv-2'],
        connector_labels: [],
        connector_labels_contains: ['modular globe'],
      });

      expect(result).toEqual({ matchedIds: ['inv-2'] });
      expect(queryRaw).toHaveBeenCalledTimes(1);
    });

    it('also matches the PL venture-team connector name, not just node labels (task 04)', async () => {
      queryRaw.mockResolvedValue([{ targetInvestorId: 'inv-9' }]);

      const result = await service.connectorMatches({
        target_investor_ids: ['inv-9'],
        connector_labels: ['Brad Holden'],
      });

      expect(result).toEqual({ matchedIds: ['inv-9'] });
      // The composed query must reach into hopChain.plConnector.name — that is
      // where the relationship-axis seed stores the PL-team connector (task 01),
      // so a PL-team search resolves even though it is not a hop-chain node.
      const args = queryRaw.mock.calls[0] as unknown[];
      const sqlText = args
        .slice(1)
        .map((v) => {
          const sql = (v as { sql?: unknown }).sql;
          const strings = (v as { strings?: unknown }).strings;
          if (typeof sql === 'string') return sql;
          if (Array.isArray(strings)) return strings.join(' ');
          return '';
        })
        .join(' ');
      expect(sqlText).toContain('plConnector');
    });

    it('drops contains labels shorter than 3 characters', async () => {
      const result = await service.connectorMatches({
        target_investor_ids: ['inv-1'],
        connector_labels: [],
        connector_labels_contains: ['ab'],
      });

      expect(result).toEqual({ matchedIds: [] });
      expect(queryRaw).not.toHaveBeenCalled();
    });

    it('rejects too many contains labels', async () => {
      const labels = Array.from({ length: 21 }, (_, i) => `team-${i}`);
      await expect(
        service.connectorMatches({
          target_investor_ids: ['inv-1'],
          connector_labels: [],
          connector_labels_contains: labels,
        })
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});

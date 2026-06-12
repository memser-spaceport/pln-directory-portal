import { BadRequestException } from '@nestjs/common';
import { PathfinderQueryService } from './pathfinder-query.service';
import { PrismaService } from '../shared/prisma.service';

describe('PathfinderQueryService', () => {
  let service: PathfinderQueryService;
  const queryRaw = jest.fn();
  const prismaMock = { $queryRaw: queryRaw } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PathfinderQueryService(prismaMock);
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

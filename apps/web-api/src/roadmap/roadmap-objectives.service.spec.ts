jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn() })),
}));

jest.mock('./roadmap.service', () => ({
  RoadmapService: jest.fn(),
}));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { AnalyticsService } from '../analytics/service/analytics.service';
import type { PrismaService } from '../shared/prisma.service';
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { RoadmapObjectivesService } from './roadmap-objectives.service';
import type { RoadmapService } from './roadmap.service';

const buildPrismaMock = () => ({
  roadmapObjective: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  roadmapItem: {
    findFirst: jest.fn(),
  },
  roadmapItemObjective: {
    count: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
    groupBy: jest.fn(),
  },
  $transaction: jest.fn(),
});

describe('RoadmapObjectivesService', () => {
  let service: RoadmapObjectivesService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let roadmapService: { getMemberAccess: jest.Mock; getItem: jest.Mock };
  let analytics: { trackEvent: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    prisma.$transaction = jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
    roadmapService = {
      getMemberAccess: jest.fn().mockResolvedValue({ canCurate: true }),
      getItem: jest.fn().mockResolvedValue({ uid: 'item-1', objectives: [] }),
    };
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    service = new RoadmapObjectivesService(
      prisma as unknown as PrismaService,
      roadmapService as unknown as RoadmapService,
      analytics as unknown as AnalyticsService
    );
  });

  describe('setItemObjectives', () => {
    it('rejects non-curators', async () => {
      roadmapService.getMemberAccess.mockResolvedValue({ canCurate: false });
      await expect(service.setItemObjectives('item-1', { objectiveUids: [] }, 'actor')).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it('404s when the item is missing', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(null);
      await expect(service.setItemObjectives('missing', { objectiveUids: [] }, 'actor')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('clears all objectives when objectiveUids is empty', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({ uid: 'item-1' });
      await service.setItemObjectives('item-1', { objectiveUids: [] }, 'actor');

      expect(prisma.roadmapItemObjective.deleteMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-1' },
      });
      expect(prisma.roadmapItemObjective.createMany).not.toHaveBeenCalled();
      expect(analytics.trackEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          name: ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_SET,
          properties: { itemUid: 'item-1', objectiveUids: [] },
        })
      );
    });

    it('replaces with the provided set of objective uids', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({ uid: 'item-1' });
      prisma.roadmapObjective.findMany.mockResolvedValue([{ uid: 'o1' }, { uid: 'o2' }]);

      await service.setItemObjectives('item-1', { objectiveUids: ['o1', 'o2'] }, 'actor');

      expect(prisma.roadmapItemObjective.deleteMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-1', objectiveUid: { notIn: ['o1', 'o2'] } },
      });
      expect(prisma.roadmapItemObjective.createMany).toHaveBeenCalledWith({
        data: [
          { itemUid: 'item-1', objectiveUid: 'o1' },
          { itemUid: 'item-1', objectiveUid: 'o2' },
        ],
        skipDuplicates: true,
      });
    });

    it('404s when an objective uid does not exist', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({ uid: 'item-1' });
      prisma.roadmapObjective.findMany.mockResolvedValue([{ uid: 'o1' }]);

      await expect(
        service.setItemObjectives('item-1', { objectiveUids: ['o1', 'missing'] }, 'actor')
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

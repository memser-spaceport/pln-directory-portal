import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { RoadmapStage } from '@prisma/client';

jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn() })),
}));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({
  AccessControlV2Service: jest.fn(),
}));

import type { PrismaService } from '../shared/prisma.service';
import type { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import type { PushNotificationsService } from '../push-notifications/push-notifications.service';
import type { AnalyticsService } from '../analytics/service/analytics.service';
import { RoadmapService } from './roadmap.service';

const baseItem = {
  uid: 'item-1',
  title: 'Test',
  description: 'Desc',
  acceptanceCriteria: null,
  stage: RoadmapStage.IDEA,
  focusAreaUid: null,
  createdByUid: 'creator-1',
  promotedAt: null,
  promotedByUid: null,
  declinedReason: null,
  externalTrackerUrl: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildPrismaMock = () => ({
  roadmapItem: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  roadmapItemUpvote: {
    findUnique: jest.fn(),
    upsert: jest.fn(),
    deleteMany: jest.fn(),
  },
  focusArea: { findUnique: jest.fn() },
});

describe('RoadmapService', () => {
  let service: RoadmapService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let accessControl: { getMemberAccess: jest.Mock };
  let pushNotifications: { create: jest.Mock };
  let analytics: { trackEvent: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    accessControl = {
      getMemberAccess: jest.fn().mockResolvedValue({
        effectivePermissions: ['roadmap.item.edit_own'],
      }),
    };
    pushNotifications = { create: jest.fn().mockResolvedValue({}) };
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };

    service = new RoadmapService(
      prisma as unknown as PrismaService,
      accessControl as unknown as AccessControlV2Service,
      pushNotifications as unknown as PushNotificationsService,
      analytics as unknown as AnalyticsService
    );
  });

  describe('canEditItem', () => {
    it('allows creator on idea stage with edit_own', () => {
      expect(
        service.canEditItem(baseItem, 'creator-1', {
          canEditOwn: true,
          canCurate: false,
          canTransition: false,
        })
      ).toBe(true);
    });

    it('denies non-creator on roadmap stage without curate', () => {
      expect(
        service.canEditItem({ ...baseItem, stage: RoadmapStage.PLANNED }, 'other-member', {
          canEditOwn: true,
          canCurate: false,
          canTransition: false,
        })
      ).toBe(false);
    });

    it('allows curator on roadmap stage', () => {
      expect(
        service.canEditItem({ ...baseItem, stage: RoadmapStage.IN_PROGRESS }, 'curator-1', {
          canEditOwn: false,
          canCurate: true,
          canTransition: true,
        })
      ).toBe(true);
    });
  });

  describe('getItem', () => {
    it('throws NotFound when item missing', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(null);
      await expect(service.getItem('missing', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateItem', () => {
    it('throws Forbidden when member cannot edit', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({
        ...baseItem,
        focusArea: null,
        createdBy: { uid: 'creator-1', name: 'A', image: null },
        promotedBy: null,
        _count: { upvotes: 0 },
      });
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: [],
      });

      await expect(service.updateItem('item-1', { title: 'New' }, 'other-member')).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });
  });

  describe('addUpvote', () => {
    it('upserts upvote and returns item', async () => {
      const row = {
        ...baseItem,
        focusArea: null,
        createdBy: { uid: 'creator-1', name: 'A', image: null },
        promotedBy: null,
        _count: { upvotes: 1 },
      };
      prisma.roadmapItem.findFirst
        .mockResolvedValueOnce(row)
        .mockResolvedValueOnce({ ...row, upvotes: [{ uid: 'up-1' }] });
      prisma.roadmapItemUpvote.upsert.mockResolvedValue({});
      prisma.roadmapItemUpvote.findUnique.mockResolvedValue({ uid: 'up-1' });

      const result = await service.addUpvote('item-1', null, 'voter-1');
      expect(result.viewerHasUpvoted).toBe(true);
      expect(prisma.roadmapItemUpvote.upsert).toHaveBeenCalled();
    });
  });
});

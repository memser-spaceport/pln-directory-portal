import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
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

import type { AnalyticsService } from '../analytics/service/analytics.service';
import type { PrismaService } from '../shared/prisma.service';
import type { RoadmapService } from './roadmap.service';
import { PINNABLE_STAGES } from './roadmap.constants';
import { RoadmapPinsService } from './roadmap-pins.service';

const buildPrismaMock = () => {
  const mock: any = {
    roadmapItem: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    roadmapItemPin: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockResolvedValue({}),
      update: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    roadmapItemUpvote: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    roadmapSettings: {
      upsert: jest.fn().mockResolvedValue({ pinLimit: 3 }),
    },
  };
  mock.$transaction = jest.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mock));
  return mock;
};

const buildRoadmapServiceMock = () => ({
  getItem: jest.fn().mockResolvedValue({ uid: 'item-1' }),
  getMemberAccess: jest.fn().mockResolvedValue({ canEditOwn: false, canCurate: true, canTransition: true }),
  assertStageAllowsSignals: jest.fn((stage: RoadmapStage) => {
    if (!PINNABLE_STAGES.includes(stage)) {
      throw new BadRequestException({ message: 'frozen', code: 'ITEM_NOT_PINNABLE' });
    }
  }),
});

describe('RoadmapPinsService', () => {
  let service: RoadmapPinsService;
  let prisma: ReturnType<typeof buildPrismaMock>;
  let roadmapService: ReturnType<typeof buildRoadmapServiceMock>;
  let analytics: { trackEvent: jest.Mock };

  const pinnableItem = { uid: 'item-1', stage: RoadmapStage.IDEA };

  beforeEach(() => {
    prisma = buildPrismaMock();
    roadmapService = buildRoadmapServiceMock();
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    service = new RoadmapPinsService(
      prisma as unknown as PrismaService,
      roadmapService as unknown as RoadmapService,
      analytics as unknown as AnalyticsService
    );
  });

  describe('pinItem', () => {
    it('creates a pin and auto-upvotes without touching an existing upvote note', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);

      await service.pinItem('item-1', { note: 'blocking my work' }, 'member-1');

      expect(prisma.roadmapItemPin.create).toHaveBeenCalledWith({
        data: { itemUid: 'item-1', memberUid: 'member-1', note: 'blocking my work' },
      });
      expect(prisma.roadmapItemUpvote.upsert).toHaveBeenCalledWith({
        where: { itemUid_memberUid: { itemUid: 'item-1', memberUid: 'member-1' } },
        create: { itemUid: 'item-1', memberUid: 'member-1', note: null },
        update: {},
      });
    });

    it('rejects with PIN_BALANCE_EXHAUSTED when the budget is spent', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.count.mockResolvedValue(3);

      await expect(service.pinItem('item-1', {}, 'member-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('is idempotent when the item is already pinned', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.findFirst.mockResolvedValue({ uid: 'pin-1' });

      await service.pinItem('item-1', {}, 'member-1');

      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
      expect(prisma.roadmapItemUpvote.upsert).not.toHaveBeenCalled();
    });

    it('rejects pinning items in frozen stages', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({ uid: 'item-1', stage: RoadmapStage.IN_PROGRESS });

      await expect(service.pinItem('item-1', {}, 'member-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('swaps atomically: unpins the swap item then pins the target', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 1 });
      prisma.roadmapItemPin.count.mockResolvedValue(2);

      await service.pinItem('item-1', { swapItemUid: 'item-2' }, 'member-1');

      expect(prisma.roadmapItemPin.deleteMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-2', memberUid: 'member-1', releasedAt: null },
      });
      expect(prisma.roadmapItemPin.create).toHaveBeenCalled();
    });

    it('rejects a swap when there is no active pin on the swap item', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.pinItem('item-1', { swapItemUid: 'item-2' }, 'member-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('rejects swapping an item with itself', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);

      await expect(service.pinItem('item-1', { swapItemUid: 'item-1' }, 'member-1')).rejects.toBeInstanceOf(
        BadRequestException
      );
    });
  });

  describe('unpinItem', () => {
    it('throws NotFound when there is no active pin', async () => {
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.unpinItem('item-1', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('deletes the active pin and returns the refreshed balance', async () => {
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 1 });
      prisma.roadmapItemPin.count.mockResolvedValue(1);

      const result = await service.unpinItem('item-1', 'member-1');

      expect(prisma.roadmapItemPin.deleteMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-1', memberUid: 'member-1', releasedAt: null },
      });
      expect(result.balance).toEqual({ limit: 3, used: 1, remaining: 2 });
    });
  });

  describe('updatePinNote', () => {
    it('throws NotFound when there is no active pin', async () => {
      prisma.roadmapItemPin.findFirst.mockResolvedValue(null);
      await expect(service.updatePinNote('item-1', 'note', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('updates the note on the active pin', async () => {
      prisma.roadmapItemPin.findFirst.mockResolvedValue({ uid: 'pin-1' });

      await service.updatePinNote('item-1', 'needed for launch', 'member-1');

      expect(prisma.roadmapItemPin.update).toHaveBeenCalledWith({
        where: { uid: 'pin-1' },
        data: { note: 'needed for launch' },
      });
    });
  });

  describe('getMyBalance', () => {
    it('clamps remaining to 0 when the limit was lowered below current usage', async () => {
      prisma.roadmapSettings.upsert.mockResolvedValue({ pinLimit: 2 });
      prisma.roadmapItemPin.findMany.mockResolvedValue([
        { uid: 'pin-1', note: null, createdAt: new Date(), item: { uid: 'a', title: 'A', stage: 'IDEA' } },
        { uid: 'pin-2', note: null, createdAt: new Date(), item: { uid: 'b', title: 'B', stage: 'IDEA' } },
        { uid: 'pin-3', note: null, createdAt: new Date(), item: { uid: 'c', title: 'C', stage: 'PLANNED' } },
      ]);

      const result = await service.getMyBalance('member-1');

      expect(result.limit).toBe(2);
      expect(result.used).toBe(3);
      expect(result.remaining).toBe(0);
      expect(result.pins).toHaveLength(3);
    });
  });

  describe('admin views', () => {
    it('rejects non-curators from the pinner list', async () => {
      roadmapService.getMemberAccess.mockResolvedValue({ canEditOwn: true, canCurate: false, canTransition: false });
      await expect(service.listItemPinners('item-1', 'member-1')).rejects.toThrow('product team');
    });

    it('lists pinners with released history, active pins first', async () => {
      prisma.roadmapItem.findUnique.mockResolvedValue({ uid: 'item-1' });
      const member = { uid: 'm1', name: 'M', image: null };
      prisma.roadmapItemPin.findMany.mockResolvedValue([
        { uid: 'pin-old', note: 'old', createdAt: new Date('2026-01-01'), releasedAt: new Date('2026-02-01'), member },
        { uid: 'pin-new', note: 'new', createdAt: new Date('2026-03-01'), releasedAt: null, member },
      ]);

      const result = await service.listItemPinners('item-1', 'admin-1');

      expect(result.total).toBe(2);
      expect(result.pins[0].uid).toBe('pin-new');
      expect(result.pins[1].releasedAt).not.toBeNull();
    });
  });

  describe('settings', () => {
    it('updates the pin limit as curator', async () => {
      prisma.roadmapSettings.upsert.mockResolvedValue({ pinLimit: 5 });

      const result = await service.updateSettings({ pinLimit: 5 }, 'admin-1');

      expect(result).toEqual({ pinLimit: 5 });
      expect(prisma.roadmapSettings.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, pinLimit: 5, updatedByUid: 'admin-1' },
        update: { pinLimit: 5, updatedByUid: 'admin-1' },
      });
    });
  });
});

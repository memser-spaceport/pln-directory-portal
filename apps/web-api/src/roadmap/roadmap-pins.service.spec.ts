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
import { DEFAULT_PIN_LIMIT, PINNABLE_STAGES } from './roadmap.constants';
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
    roadmapSettings: {
      upsert: jest.fn().mockResolvedValue({ pinLimit: DEFAULT_PIN_LIMIT }),
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
    it('creates a pin with impact and an optional note', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);

      await service.pinItem('item-1', { impact: 4, note: 'blocking my work' }, 'member-1');

      expect(prisma.roadmapItemPin.create).toHaveBeenCalledWith({
        data: { itemUid: 'item-1', memberUid: 'member-1', note: 'blocking my work', impact: 4 },
      });
    });

    it('creates a pin without impact when the rating is skipped', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);

      await service.pinItem('item-1', {}, 'member-1');

      expect(prisma.roadmapItemPin.create).toHaveBeenCalledWith({
        data: { itemUid: 'item-1', memberUid: 'member-1', note: null, impact: null },
      });
    });

    it('rejects with PIN_BALANCE_EXHAUSTED when the budget is spent', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.count.mockResolvedValue(DEFAULT_PIN_LIMIT);

      await expect(service.pinItem('item-1', { impact: 3 }, 'member-1')).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('updates impact when the item is already pinned', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.findFirst.mockResolvedValue({ uid: 'pin-1' });

      await service.pinItem('item-1', { impact: 5 }, 'member-1');

      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
      expect(prisma.roadmapItemPin.update).toHaveBeenCalledWith({
        where: { uid: 'pin-1' },
        data: { impact: 5 },
      });
    });

    it('rejects pinning items in frozen stages', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({ uid: 'item-1', stage: RoadmapStage.IN_PROGRESS });

      await expect(service.pinItem('item-1', { impact: 2 }, 'member-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('swaps atomically: unpins the swap item then pins the target', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 1 });
      prisma.roadmapItemPin.count.mockResolvedValue(2);

      await service.pinItem('item-1', { impact: 3, swapItemUid: 'item-2' }, 'member-1');

      expect(prisma.roadmapItemPin.deleteMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-2', memberUid: 'member-1', releasedAt: null },
      });
      expect(prisma.roadmapItemPin.create).toHaveBeenCalled();
    });

    it('rejects a swap when there is no active pin on the swap item', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);
      prisma.roadmapItemPin.deleteMany.mockResolvedValue({ count: 0 });

      await expect(service.pinItem('item-1', { impact: 3, swapItemUid: 'item-2' }, 'member-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.roadmapItemPin.create).not.toHaveBeenCalled();
    });

    it('rejects swapping an item with itself', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(pinnableItem);

      await expect(service.pinItem('item-1', { impact: 3, swapItemUid: 'item-1' }, 'member-1')).rejects.toBeInstanceOf(
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
      expect(result.balance).toEqual({
        limit: DEFAULT_PIN_LIMIT,
        used: 1,
        remaining: DEFAULT_PIN_LIMIT - 1,
      });
    });
  });

  describe('updatePinNote', () => {
    it('throws NotFound when there is no active pin', async () => {
      prisma.roadmapItemPin.findFirst.mockResolvedValue(null);
      await expect(service.updatePinNote('item-1', { note: 'note' }, 'member-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('updates the note on the active pin', async () => {
      prisma.roadmapItemPin.findFirst.mockResolvedValue({ uid: 'pin-1' });

      await service.updatePinNote('item-1', { note: 'needed for launch' }, 'member-1');

      expect(prisma.roadmapItemPin.update).toHaveBeenCalledWith({
        where: { uid: 'pin-1' },
        data: { note: 'needed for launch' },
      });
    });

    it('updates impact on the active pin', async () => {
      prisma.roadmapItemPin.findFirst.mockResolvedValue({ uid: 'pin-1' });

      await service.updatePinNote('item-1', { impact: 2 }, 'member-1');

      expect(prisma.roadmapItemPin.update).toHaveBeenCalledWith({
        where: { uid: 'pin-1' },
        data: { impact: 2 },
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
        {
          uid: 'pin-old',
          note: 'old',
          impact: 3,
          createdAt: new Date('2026-01-01'),
          releasedAt: new Date('2026-02-01'),
          member,
        },
        { uid: 'pin-new', note: 'new', impact: 5, createdAt: new Date('2026-03-01'), releasedAt: null, member },
      ]);

      const result = await service.listItemPinners('item-1', 'admin-1');

      expect(result.total).toBe(2);
      expect(result.pins[0].uid).toBe('pin-new');
      expect(result.pins[0].impact).toBe(5);
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

    it('defaults new settings rows to DEFAULT_PIN_LIMIT of 10', async () => {
      expect(DEFAULT_PIN_LIMIT).toBe(10);
      await service.getSettings();
      expect(prisma.roadmapSettings.upsert).toHaveBeenCalledWith({
        where: { id: 1 },
        create: { id: 1, pinLimit: 10 },
        update: {},
      });
    });
  });
});

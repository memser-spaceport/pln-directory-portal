import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
  focusArea: null,
  type: null,
  tags: [],
  order: 99,
  createdByUid: 'creator-1',
  promotedAt: null,
  promotedByUid: null,
  declinedReason: null,
  externalTrackerUrl: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const buildPrismaMock = () => {
  const mock: any = {
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
    roadmapItemPin: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  mock.$transaction = jest.fn(async (arg: unknown) => {
    if (typeof arg === 'function') {
      return arg(mock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
  return mock;
};

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
    const row = {
      ...baseItem,
      createdBy: { uid: 'creator-1', name: 'A', image: null },
      promotedBy: null,
      objective: null,
      _count: { upvotes: 0, pins: 0 },
    };

    it('throws NotFound when item missing', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(null);
      await expect(service.getItem('missing', 'member-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('embeds the pinner list (incl. released) for curators', async () => {
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: ['roadmap.item.curate'],
      });
      prisma.roadmapItem.findFirst.mockResolvedValue(row);
      prisma.roadmapItemPin.findMany.mockResolvedValue([
        {
          uid: 'pin-old',
          note: 'old',
          createdAt: new Date('2026-01-01'),
          releasedAt: new Date('2026-02-01'),
          member: { uid: 'm1', name: 'M1', image: null },
        },
        {
          uid: 'pin-new',
          note: 'blocking',
          createdAt: new Date('2026-03-01'),
          releasedAt: null,
          member: { uid: 'admin-1', name: 'Admin', image: { url: 'http://img' } },
        },
      ]);

      const result = await service.getItem('item-1', 'admin-1');

      expect(result.pins).toHaveLength(2);
      expect(result.pins?.[0]).toMatchObject({ uid: 'pin-new', note: 'blocking', member: { name: 'Admin' } });
      expect(result.pins?.[1].releasedAt).not.toBeNull();
      expect(result.pinCount).toBe(1); // active pins only (IDEA is pinnable)
      expect(result.viewerHasPinned).toBe(true); // admin-1 holds the active pin
      expect(result.viewerPinNote).toBe('blocking');
    });

    it('returns pins as null for non-curators', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(row);

      const result = await service.getItem('item-1', 'member-1');

      expect(result.pins).toBeNull();
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
        objective: null,
        _count: { upvotes: 1, pins: 0 },
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

    it.each([RoadmapStage.IN_PROGRESS, RoadmapStage.BACKLOG, RoadmapStage.SHIPPED, RoadmapStage.DECLINED])(
      'rejects likes on %s items (counts frozen)',
      async (stage) => {
        prisma.roadmapItem.findFirst.mockResolvedValue({
          ...baseItem,
          stage,
          createdBy: { uid: 'creator-1', name: 'A', image: null },
          promotedBy: null,
          objective: null,
          _count: { upvotes: 0, pins: 0 },
        });

        await expect(service.addUpvote('item-1', null, 'voter-1')).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.roadmapItemUpvote.upsert).not.toHaveBeenCalled();
      }
    );

    it('rejects unliking frozen items', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue({
        ...baseItem,
        stage: RoadmapStage.SHIPPED,
        createdBy: { uid: 'creator-1', name: 'A', image: null },
        promotedBy: null,
        objective: null,
        _count: { upvotes: 0, pins: 0 },
      });

      await expect(service.removeUpvote('item-1', 'voter-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.roadmapItemUpvote.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('transitionItem pin release', () => {
    const rowFor = (stage: RoadmapStage) => ({
      ...baseItem,
      stage,
      createdBy: { uid: 'creator-1', name: 'A', image: null },
      promotedBy: null,
      objective: null,
      _count: { upvotes: 0, pins: 2 },
    });

    beforeEach(() => {
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: ['roadmap.item.transition'],
      });
    });

    it('releases active pins when an item enters IN_PROGRESS', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
      prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
      prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 2 });

      await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

      expect(prisma.roadmapItemPin.updateMany).toHaveBeenCalledWith({
        where: { itemUid: 'item-1', releasedAt: null },
        data: { releasedAt: expect.any(Date) },
      });
    });

    it('does not release pins when moving between pinnable stages', async () => {
      prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IDEA));
      prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.PLANNED));

      await service.transitionItem('item-1', { stage: 'PLANNED' }, 'curator-1');

      expect(prisma.roadmapItemPin.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('notifications (PRD §7)', () => {
    const rowFor = (stage: RoadmapStage) => ({
      ...baseItem,
      stage,
      createdBy: { uid: 'creator-1', name: 'A', image: null },
      promotedBy: null,
      objective: null,
      _count: { upvotes: 0, pins: 2 },
    });

    beforeEach(() => {
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: ['roadmap.item.transition'],
      });
    });

    describe('new submission broadcast', () => {
      beforeEach(() => {
        accessControl.getMemberAccess.mockResolvedValue({ effectivePermissions: ['roadmap.idea.create'] });
        prisma.roadmapItem.create.mockResolvedValue(rowFor(RoadmapStage.IDEA));
      });

      it('sends one permission-gated notification on IDEA submission', async () => {
        await service.createItem({ title: 'Test', description: 'Desc' }, 'creator-1');

        expect(pushNotifications.create).toHaveBeenCalledTimes(1);
        expect(pushNotifications.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'New need: "Test" — take a look, boost it if it matters to you.',
            link: expect.stringContaining('/gantry/item-1'),
            requiredPermissions: ['roadmap.view', 'roadmap.admin'],
            isPublic: false,
            metadata: expect.objectContaining({ eventType: 'roadmap', itemUid: 'item-1', authorUid: 'creator-1' }),
          })
        );
        expect(pushNotifications.create).toHaveBeenCalledWith(
          expect.not.objectContaining({ recipientUid: expect.anything() })
        );
      });

      it('does not broadcast curator direct-creates into roadmap stages', async () => {
        accessControl.getMemberAccess.mockResolvedValue({ effectivePermissions: ['roadmap.item.curate'] });
        prisma.roadmapItem.create.mockResolvedValue(rowFor(RoadmapStage.PLANNED));

        await service.createItem({ title: 'Test', description: 'Desc', stage: 'PLANNED' }, 'curator-1');

        expect(pushNotifications.create).not.toHaveBeenCalled();
      });

      it('does not fail the submission when the broadcast errors', async () => {
        pushNotifications.create.mockRejectedValue(new Error('ws down'));

        const result = await service.createItem({ title: 'Test', description: 'Desc' }, 'creator-1');

        expect(result.uid).toBe('item-1');
      });
    });

    describe('boost returned on IN_PROGRESS', () => {
      it('notifies each member whose pin was just released', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }, { memberUid: 'pinner-2' }]);
        prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 2 });

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(([dto]: [any]) =>
          dto.title.includes('your boost is back to spend')
        );
        expect(boostReturnedCalls.map(([dto]: [any]) => dto.recipientUid)).toEqual(['pinner-1', 'pinner-2']);
        expect(boostReturnedCalls[0][0]).toMatchObject({
          title: '"Test" is now in progress — your boost is back to spend.',
          link: expect.stringContaining('/gantry/item-1'),
          metadata: expect.objectContaining({ trigger: 'boost_returned' }),
        });
      });

      it('does not notify on pin-releasing stages other than IN_PROGRESS', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IDEA));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.BACKLOG));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);

        await service.transitionItem('item-1', { stage: 'BACKLOG' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(([dto]: [any]) =>
          dto.title.includes('your boost is back to spend')
        );
        expect(boostReturnedCalls).toHaveLength(0);
      });

      it('does not fail the transition when notification sending errors', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);
        pushNotifications.create.mockRejectedValue(new Error('ws down'));

        const result = await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        expect(result.stage).toBe(RoadmapStage.IN_PROGRESS);
      });
    });

    describe('shipped to backers', () => {
      it('notifies every distinct member who ever pinned, excluding the creator', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        // release query inside the tx finds nothing (pins already released at IN_PROGRESS),
        // backers-ever query returns the full history
        prisma.roadmapItemPin.findMany
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([{ memberUid: 'pinner-1' }, { memberUid: 'pinner-2' }, { memberUid: 'creator-1' }]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        const shippedBackerCalls = pushNotifications.create.mock.calls.filter(([dto]: [any]) =>
          dto.title.includes('just shipped')
        );
        expect(shippedBackerCalls.map(([dto]: [any]) => dto.recipientUid)).toEqual(['pinner-1', 'pinner-2']);
        expect(shippedBackerCalls[0][0]).toMatchObject({
          title: '"Test" you backed just shipped 🎉',
          metadata: expect.objectContaining({ trigger: 'backed_item_shipped' }),
        });

        // the creator still gets their dedicated shipped notification
        const creatorCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.recipientUid === 'creator-1'
        );
        expect(creatorCalls).toHaveLength(1);
        expect(creatorCalls[0][0].title).toBe('"Test" has shipped.');
      });

      it('does not re-fire boost-returned on IN_PROGRESS → SHIPPED (pins already released)', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(([dto]: [any]) =>
          dto.title.includes('your boost is back to spend')
        );
        expect(boostReturnedCalls).toHaveLength(0);
      });
    });
  });

  describe('reorderItems', () => {
    beforeEach(() => {
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: ['roadmap.item.curate'],
      });
    });

    it('rejects non-curators', async () => {
      accessControl.getMemberAccess.mockResolvedValue({ effectivePermissions: [] });
      await expect(service.reorderItems({ items: [{ uid: 'item-1', order: 1 }] }, 'member-1')).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });

    it('rejects unknown item uids', async () => {
      prisma.roadmapItem.findMany.mockResolvedValue([{ uid: 'item-1' }]);
      await expect(
        service.reorderItems(
          {
            items: [
              { uid: 'item-1', order: 1 },
              { uid: 'item-2', order: 2 },
            ],
          },
          'curator-1'
        )
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('writes orders verbatim in one transaction', async () => {
      prisma.roadmapItem.findMany.mockResolvedValue([{ uid: 'item-1' }, { uid: 'item-2' }]);
      prisma.roadmapItem.update.mockResolvedValue({});

      const result = await service.reorderItems(
        {
          items: [
            { uid: 'item-1', order: 1.5 },
            { uid: 'item-2', order: 2 },
          ],
        },
        'curator-1'
      );

      expect(result).toEqual({ updated: 2 });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.roadmapItem.update).toHaveBeenCalledWith({ where: { uid: 'item-1' }, data: { order: 1.5 } });
      expect(prisma.roadmapItem.update).toHaveBeenCalledWith({ where: { uid: 'item-2' }, data: { order: 2 } });
    });
  });
});

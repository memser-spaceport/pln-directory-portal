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
  let pushNotifications: { create: jest.Mock; hasItemTriggerNotification: jest.Mock };
  let analytics: { trackEvent: jest.Mock };

  beforeEach(() => {
    prisma = buildPrismaMock();
    accessControl = {
      getMemberAccess: jest.fn().mockResolvedValue({
        effectivePermissions: ['roadmap.item.edit_own'],
      }),
    };
    pushNotifications = {
      create: jest.fn().mockResolvedValue({}),
      hasItemTriggerNotification: jest.fn().mockResolvedValue(false),
    };
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
      objectives: [],
      _count: { pins: 0 },
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
        _count: { pins: 0 },
      });
      accessControl.getMemberAccess.mockResolvedValue({
        effectivePermissions: [],
      });

      await expect(service.updateItem('item-1', { title: 'New' }, 'other-member')).rejects.toBeInstanceOf(
        ForbiddenException
      );
    });
  });

  describe('transitionItem pin release', () => {
    const rowFor = (stage: RoadmapStage) => ({
      ...baseItem,
      stage,
      createdBy: { uid: 'creator-1', name: 'A', image: null },
      promotedBy: null,
      objectives: [],
      _count: { pins: 2 },
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
      objectives: [],
      _count: { pins: 2 },
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
            title: 'New submission: Test',
            description: 'Take a look — boost it if it matters to you.',
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

      it.each(['BACKLOG', 'SHIPPED', 'DECLINED'] as const)(
        'allows curators to direct-create into %s',
        async (stage) => {
          accessControl.getMemberAccess.mockResolvedValue({ effectivePermissions: ['roadmap.item.curate'] });
          prisma.roadmapItem.create.mockResolvedValue(rowFor(stage as RoadmapStage));

          const result = await service.createItem({ title: 'Test', description: 'Desc', stage }, 'curator-1');

          expect(result.stage).toBe(stage);
          expect(prisma.roadmapItem.create).toHaveBeenCalledWith(
            expect.objectContaining({ data: expect.objectContaining({ stage }) })
          );
          expect(pushNotifications.create).not.toHaveBeenCalled();
        }
      );

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

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.metadata?.trigger === 'boost_returned'
        );
        expect(boostReturnedCalls.map(([dto]: [any]) => dto.recipientUid)).toEqual(['pinner-1', 'pinner-2']);
        expect(boostReturnedCalls[0][0]).toMatchObject({
          title: 'In Progress: Test',
          description: 'Your boost budget is back — spend it on what matters next.',
          link: expect.stringContaining('/gantry/item-1'),
        });
      });

      it('skips boost-returned for the submitter who also pinned their own item', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }, { memberUid: 'creator-1' }]);
        prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 2 });

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.metadata?.trigger === 'boost_returned'
        );
        expect(boostReturnedCalls.map(([dto]: [any]) => dto.recipientUid)).toEqual(['pinner-1']);

        const creatorCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.recipientUid === 'creator-1'
        );
        expect(creatorCalls).toHaveLength(1);
        expect(creatorCalls[0][0].metadata?.trigger).toBe('need_in_progress');
      });

      it('does not notify on pin-releasing stages other than IN_PROGRESS', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IDEA));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.BACKLOG));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);

        await service.transitionItem('item-1', { stage: 'BACKLOG' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.metadata?.trigger === 'boost_returned'
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

    describe('shipped broadcast', () => {
      it('sends one permission-gated notification to roadmap viewers', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        expect(pushNotifications.create).toHaveBeenCalledTimes(1);
        expect(pushNotifications.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Just Shipped: Test 🎉',
            description: "It's live now — go try it out.",
            link: expect.stringContaining('/gantry/item-1'),
            requiredPermissions: ['roadmap.view', 'roadmap.admin'],
            isPublic: false,
            metadata: expect.objectContaining({
              eventType: 'roadmap',
              itemUid: 'item-1',
              trigger: 'need_shipped',
            }),
          })
        );
        expect(pushNotifications.create).toHaveBeenCalledWith(
          expect.not.objectContaining({ recipientUid: expect.anything() })
        );
        expect(pushNotifications.create).toHaveBeenCalledWith(
          expect.not.objectContaining({ metadata: expect.objectContaining({ authorUid: expect.anything() }) })
        );
        expect(
          pushNotifications.create.mock.calls.filter(([dto]: [any]) => dto.metadata?.trigger === 'backed_item_shipped')
        ).toHaveLength(0);
      });

      it('does not re-fire boost-returned on IN_PROGRESS → SHIPPED (pins already released)', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        const boostReturnedCalls = pushNotifications.create.mock.calls.filter(
          ([dto]: [any]) => dto.metadata?.trigger === 'boost_returned'
        );
        expect(boostReturnedCalls).toHaveLength(0);
      });
    });

    describe('committed-stage notifications fire exactly once', () => {
      const triggerCalls = (trigger: string) =>
        pushNotifications.create.mock.calls.filter(([dto]: [any]) => dto.metadata?.trigger === trigger);

      it('checks for prior committed-stage notifications by itemUid + trigger', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        expect(pushNotifications.hasItemTriggerNotification).toHaveBeenCalledWith(
          'item-1',
          expect.arrayContaining(['need_in_progress', 'boost_returned', 'need_shipped', 'backed_item_shipped'])
        );
      });

      it('notifies In Progress the first time when no prior notification exists', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);
        prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 1 });

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        expect(triggerCalls('boost_returned')).toHaveLength(1);
        expect(triggerCalls('need_in_progress')).toHaveLength(1);
      });

      it('does not re-notify In Progress when an In Progress notification already exists', async () => {
        pushNotifications.hasItemTriggerNotification.mockResolvedValue(true);
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);
        prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 1 });

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        expect(triggerCalls('boost_returned')).toHaveLength(0);
        expect(triggerCalls('need_in_progress')).toHaveLength(0);
      });

      it('does not notify In Progress when the item was already Shipped (Shipped → In Progress)', async () => {
        // A prior "shipped" notification is reported, which the In Progress check also matches.
        pushNotifications.hasItemTriggerNotification.mockResolvedValue(true);
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([{ memberUid: 'pinner-1' }]);
        prisma.roadmapItemPin.updateMany.mockResolvedValue({ count: 1 });

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        expect(triggerCalls('boost_returned')).toHaveLength(0);
        expect(triggerCalls('need_in_progress')).toHaveLength(0);
      });

      it('notifies the first time an item ships', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        expect(pushNotifications.hasItemTriggerNotification).toHaveBeenCalledWith(
          'item-1',
          expect.arrayContaining(['need_shipped', 'backed_item_shipped'])
        );
        expect(triggerCalls('need_shipped')).toHaveLength(1);
        expect(triggerCalls('backed_item_shipped')).toHaveLength(0);
      });

      it('does not re-notify Shipped when a Shipped notification already exists', async () => {
        pushNotifications.hasItemTriggerNotification.mockResolvedValue(true);
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.SHIPPED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'SHIPPED' }, 'curator-1');

        expect(triggerCalls('backed_item_shipped')).toHaveLength(0);
        expect(triggerCalls('need_shipped')).toHaveLength(0);
      });
    });

    describe('submitter stage-change notifications', () => {
      const submitterCallsByTrigger = (trigger: string) =>
        pushNotifications.create.mock.calls.filter(([dto]: [any]) => dto.metadata?.trigger === trigger);

      it('notifies the submitter when their need is planned', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IDEA));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.PLANNED));

        await service.transitionItem('item-1', { stage: 'PLANNED' }, 'curator-1');

        const calls = submitterCallsByTrigger('need_planned');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toMatchObject({
          recipientUid: 'creator-1',
          title: 'Planned: Test',
          description: 'Your need is on the roadmap.',
        });
      });

      it('notifies the submitter when their need enters In Progress', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.IN_PROGRESS));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'IN_PROGRESS' }, 'curator-1');

        const calls = submitterCallsByTrigger('need_in_progress');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toMatchObject({
          recipientUid: 'creator-1',
          title: 'In Progress: Test',
          description: "Your submission is being worked on. We will notify you when it's shipped.",
        });
      });

      it('notifies the submitter when their need is backlogged', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.IDEA));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.BACKLOG));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'BACKLOG' }, 'curator-1');

        const calls = submitterCallsByTrigger('need_backlogged');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toMatchObject({
          recipientUid: 'creator-1',
          title: 'Backlog: Test',
          description: 'Your need was moved to the backlog.',
        });
      });

      it('notifies the submitter with a fallback reason on DECLINED via raw transition', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.DECLINED));
        prisma.roadmapItemPin.findMany.mockResolvedValueOnce([]);

        await service.transitionItem('item-1', { stage: 'DECLINED' }, 'curator-1');

        const calls = submitterCallsByTrigger('need_declined');
        expect(calls).toHaveLength(1);
        expect(calls[0][0]).toMatchObject({
          recipientUid: 'creator-1',
          title: 'Declined: Test',
          description: 'Reason: No reason provided.',
        });
      });

      it('does not notify when the stage does not change', async () => {
        prisma.roadmapItem.findFirst.mockResolvedValue(rowFor(RoadmapStage.PLANNED));
        prisma.roadmapItem.update.mockResolvedValue(rowFor(RoadmapStage.PLANNED));

        await service.transitionItem('item-1', { stage: 'PLANNED' }, 'curator-1');

        expect(pushNotifications.create).not.toHaveBeenCalled();
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

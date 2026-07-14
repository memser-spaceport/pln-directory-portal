import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PushNotificationCategory, RoadmapItem, RoadmapStage } from '@prisma/client';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  DeclineRoadmapItemSchema,
  ReorderRoadmapItemsSchema,
  RoadmapItemListQueryParams,
  TransitionRoadmapItemSchema,
  UpdateRoadmapItemSchema,
} from 'libs/contracts/src/schema/roadmap';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { ADMIN_PERMISSIONS, ROADMAP_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PrismaService } from '../shared/prisma.service';
import {
  PINNABLE_STAGES,
  PIN_RELEASING_STAGES,
  REACHED_IN_PROGRESS_NOTIFICATION_TRIGGERS,
  ROADMAP_ANALYTICS_EVENTS,
  ROADMAP_NOTIFICATION_COPY,
  ROADMAP_NOTIFICATION_TRIGGERS,
  SHIPPED_NOTIFICATION_TRIGGERS,
  TRENDING_HALF_LIFE_DAYS,
  itemDetailPath,
} from './roadmap.constants';
import { AdminPinDto, AdminPinRow, toAdminPinList } from './roadmap-pin.util';
import { assertTransitionAllowed, isDeclineTransition, isIdeaStage, isPromoteTransition } from './roadmap-stage.util';

type CreateBody = z.infer<typeof CreateRoadmapItemSchema>;
type UpdateBody = z.infer<typeof UpdateRoadmapItemSchema>;
type ListQuery = z.infer<typeof RoadmapItemListQueryParams>;
type ArchiveBody = z.infer<typeof ArchiveRoadmapItemSchema>;
type DeclineBody = z.infer<typeof DeclineRoadmapItemSchema>;
type TransitionBody = z.infer<typeof TransitionRoadmapItemSchema>;
type ReorderBody = z.infer<typeof ReorderRoadmapItemsSchema>;

type MemberAccess = {
  canEditOwn: boolean;
  canCurate: boolean;
  canTransition: boolean;
};

const itemInclude: Prisma.RoadmapItemInclude = {
  createdBy: { select: { uid: true, name: true, image: { select: { url: true } } } },
  promotedBy: { select: { uid: true, name: true } },
  objectives: {
    include: { objective: { select: { uid: true, title: true, order: true } } },
    orderBy: { objective: { order: 'asc' } },
  },
  _count: { select: { pins: true } },
};

const adminPinSelect = {
  uid: true,
  note: true,
  createdAt: true,
  releasedAt: true,
  member: { select: { uid: true, name: true, image: { select: { url: true } } } },
} as const;

interface RoadmapItemRow {
  uid: string;
  title: string;
  description: string;
  acceptanceCriteria: string | null;
  stage: RoadmapStage;
  focusArea: string | null;
  type: string | null;
  tags: string[];
  order: number;
  createdByUid: string;
  createdBy: { uid: string; name: string; image: { url: string } | null };
  promotedAt: Date | null;
  promotedByUid: string | null;
  declinedReason: string | null;
  externalTrackerUrl: string | null;
  objectives: { objective: { uid: string; title: string; order: number } }[];
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { pins: number };
}

interface ViewerPinState {
  viewerHasPinned: boolean;
  viewerPinNote: string | null;
  activePinCount: number;
}

const EMPTY_PIN_STATE: ViewerPinState = { viewerHasPinned: false, viewerPinNote: null, activePinCount: 0 };

@Injectable()
export class RoadmapService {
  private readonly logger = new Logger(RoadmapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlV2Service,
    private readonly pushNotifications: PushNotificationsService,
    private readonly analytics: AnalyticsService
  ) {}

  async getMemberAccess(memberUid: string): Promise<MemberAccess> {
    const access = await this.accessControl.getMemberAccess(memberUid);
    const perms = new Set(access.effectivePermissions);
    const canCurate = perms.has(ROADMAP_PERMISSIONS.ITEM_CURATE) || perms.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
    const canTransition = perms.has(ROADMAP_PERMISSIONS.ITEM_TRANSITION) || perms.has(ADMIN_PERMISSIONS.DIRECTORY_FULL);
    return {
      canEditOwn: perms.has(ROADMAP_PERMISSIONS.ITEM_EDIT_OWN),
      canCurate,
      canTransition,
    };
  }

  canEditItem(
    item: Pick<RoadmapItem, 'stage' | 'createdByUid' | 'deletedAt'>,
    memberUid: string,
    access: MemberAccess
  ): boolean {
    if (item.deletedAt) {
      return false;
    }
    if (isIdeaStage(item.stage)) {
      return (item.createdByUid === memberUid && access.canEditOwn) || access.canCurate;
    }
    return access.canCurate;
  }

  async listItems(query: ListQuery, viewerUid: string) {
    const where = this.buildListWhere(query, viewerUid);
    const access = await this.getMemberAccess(viewerUid);
    const rows = (await this.prisma.roadmapItem.findMany({
      where,
      include: {
        ...itemInclude,
        pins: { where: { memberUid: viewerUid, releasedAt: null }, select: { note: true }, take: 1 },
      },
    })) as unknown as (RoadmapItemRow & { pins: { note: string | null }[] })[];

    // Curators get the full pinner lists embedded; everyone else only needs active-pin
    // timestamps for counts and trending scores.
    let activePins: { itemUid: string; createdAt: Date }[];
    let adminPinsByItem: Map<string, AdminPinRow[]> | null = null;
    if (access.canCurate) {
      const fullPins = await this.prisma.roadmapItemPin.findMany({
        where: { itemUid: { in: rows.map((row) => row.uid) } },
        select: { itemUid: true, ...adminPinSelect },
      });
      adminPinsByItem = new Map();
      for (const pin of fullPins) {
        const list = adminPinsByItem.get(pin.itemUid) ?? [];
        list.push(pin);
        adminPinsByItem.set(pin.itemUid, list);
      }
      activePins = fullPins.filter((pin) => !pin.releasedAt);
    } else {
      activePins = await this.prisma.roadmapItemPin.findMany({
        where: { itemUid: { in: rows.map((row) => row.uid) }, releasedAt: null },
        select: { itemUid: true, createdAt: true },
      });
    }

    const activePinCounts = new Map<string, number>();
    const trendingScores = new Map<string, number>();
    const now = Date.now();
    const msPerDay = 24 * 60 * 60 * 1000;
    for (const pin of activePins) {
      activePinCounts.set(pin.itemUid, (activePinCounts.get(pin.itemUid) ?? 0) + 1);
      const ageDays = Math.max(0, now - pin.createdAt.getTime()) / msPerDay;
      const score = Math.pow(0.5, ageDays / TRENDING_HALF_LIFE_DAYS);
      trendingScores.set(pin.itemUid, (trendingScores.get(pin.itemUid) ?? 0) + score);
    }

    const displayedPinCount = (row: RoadmapItemRow) =>
      this.isPinnableStage(row.stage) ? activePinCounts.get(row.uid) ?? 0 : row._count.pins;

    const sortMode = query.sort ?? 'default';
    const sorted = rows.sort((a, b) => {
      if (sortMode === 'newest') {
        return b.createdAt.getTime() - a.createdAt.getTime();
      }
      if (sortMode === 'top_pins' || sortMode === 'trending') {
        if (sortMode === 'trending') {
          const scoreDiff = (trendingScores.get(b.uid) ?? 0) - (trendingScores.get(a.uid) ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
        }
        const pinDiff = displayedPinCount(b) - displayedPinCount(a);
        if (pinDiff !== 0) return pinDiff;
        return b.updatedAt.getTime() - a.updatedAt.getTime();
      }
      const orderDiff = a.order - b.order;
      if (orderDiff !== 0) return orderDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    return {
      items: sorted.map((row) =>
        this.toDto(
          row,
          viewerUid,
          {
            viewerHasPinned: row.pins.length > 0,
            viewerPinNote: row.pins[0]?.note ?? null,
            activePinCount: activePinCounts.get(row.uid) ?? 0,
          },
          adminPinsByItem ? toAdminPinList(adminPinsByItem.get(row.uid) ?? []) : null
        )
      ),
      total: sorted.length,
    };
  }

  async getItem(uid: string, viewerUid: string) {
    const row = await this.findActiveOrThrow(uid);
    return this.composeDto(row, viewerUid);
  }

  async createItem(body: CreateBody, actorUid: string) {
    const access = await this.getMemberAccess(actorUid);
    let stage: RoadmapStage = RoadmapStage.IDEA;

    if (body.stage && body.stage !== 'IDEA') {
      if (!access.canCurate) {
        throw new ForbiddenException('Only the product team can create roadmap-stage items directly');
      }
      stage = body.stage as RoadmapStage;
    }

    const row = await this.prisma.roadmapItem.create({
      data: {
        title: body.title,
        description: body.description,
        acceptanceCriteria: body.acceptanceCriteria ?? null,
        focusArea: body.focusArea ?? null,
        type: body.type ?? null,
        tags: body.tags ?? [],
        externalTrackerUrl: body.externalTrackerUrl ?? null,
        stage,
        createdByUid: actorUid,
        promotedAt: stage === RoadmapStage.PLANNED ? new Date() : null,
        promotedByUid: stage === RoadmapStage.PLANNED ? actorUid : null,
      },
      include: itemInclude,
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_CREATED, actorUid, {
      itemUid: row.uid,
      stage: row.stage,
    });

    // Only true submissions ("Share a need" → IDEA) are broadcast; curator
    // direct-creates into other stages are roadmap work, not new needs.
    if (stage === RoadmapStage.IDEA) {
      await this.notifyNewSubmission(row, actorUid);
    }

    return this.toDto(row as unknown as RoadmapItemRow, actorUid, EMPTY_PIN_STATE, access.canCurate ? [] : null);
  }

  async updateItem(uid: string, body: UpdateBody, actorUid: string) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (!this.canEditItem(existing, actorUid, access)) {
      throw new ForbiddenException('You cannot edit this item');
    }
    if (body.order !== undefined && !access.canCurate) {
      throw new ForbiddenException('Only the product team can reorder items');
    }

    const row = await this.prisma.roadmapItem.update({
      where: { uid },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.acceptanceCriteria !== undefined ? { acceptanceCriteria: body.acceptanceCriteria } : {}),
        ...(body.focusArea !== undefined ? { focusArea: body.focusArea } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.tags !== undefined ? { tags: body.tags } : {}),
        ...(body.externalTrackerUrl !== undefined ? { externalTrackerUrl: body.externalTrackerUrl } : {}),
        ...(body.order !== undefined ? { order: body.order } : {}),
      },
      include: itemInclude,
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_UPDATED, actorUid, { itemUid: uid });
    return this.composeDto(row as unknown as RoadmapItemRow, actorUid, access);
  }

  async reorderItems(body: ReorderBody, actorUid: string) {
    const access = await this.getMemberAccess(actorUid);
    if (!access.canCurate) {
      throw new ForbiddenException('Only the product team can reorder items');
    }

    const uids = body.items.map((item) => item.uid);
    if (new Set(uids).size !== uids.length) {
      throw new BadRequestException('Duplicate item uids in reorder payload');
    }

    const existing = await this.prisma.roadmapItem.findMany({
      where: { uid: { in: uids }, deletedAt: null },
      select: { uid: true },
    });
    const known = new Set(existing.map((item) => item.uid));
    const unknown = uids.filter((uid) => !known.has(uid));
    if (unknown.length) {
      throw new BadRequestException(`Unknown roadmap items: ${unknown.join(', ')}`);
    }

    await this.prisma.$transaction(
      body.items.map(({ uid, order }) => this.prisma.roadmapItem.update({ where: { uid }, data: { order } }))
    );

    await this.track(ROADMAP_ANALYTICS_EVENTS.ITEMS_REORDERED, actorUid, { count: body.items.length });
    return { updated: body.items.length };
  }

  async archiveItem(uid: string, body: ArchiveBody, actorUid: string) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (!this.canEditItem(existing, actorUid, access)) {
      throw new ForbiddenException('You cannot archive this item');
    }

    const { row, releasedPins } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.roadmapItem.update({
        where: { uid },
        data: {
          deletedAt: new Date(),
          deletionReason: body.deletionReason ?? null,
        },
        include: itemInclude,
      });
      const released = await this.releaseActivePins(tx, uid);
      return { row: updated, releasedPins: released };
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_ARCHIVED, actorUid, { itemUid: uid });
    await this.trackPinsReleased(uid, actorUid, releasedPins, 'archived');
    return this.toDto(row as unknown as RoadmapItemRow, actorUid, EMPTY_PIN_STATE);
  }

  async promoteItem(uid: string, actorUid: string) {
    return this.applyStageChange(uid, RoadmapStage.PLANNED, actorUid, {
      requireTransitionPerm: true,
      setPromoted: true,
    });
  }

  async declineItem(uid: string, body: DeclineBody, actorUid: string) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (!access.canTransition) {
      throw new ForbiddenException('Missing permission to decline items');
    }
    assertTransitionAllowed(existing.stage, RoadmapStage.DECLINED);

    const { row, releasedPins } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.roadmapItem.update({
        where: { uid },
        data: {
          stage: RoadmapStage.DECLINED,
          declinedReason: body.reason,
        },
        include: itemInclude,
      });
      const released = await this.releaseActivePins(tx, uid);
      return { row: updated, releasedPins: released };
    });

    // await this.notifyDeclined(row, body.reason);
    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_DECLINED, actorUid, {
      itemUid: uid,
      reason: body.reason,
    });
    await this.trackPinsReleased(uid, actorUid, releasedPins, RoadmapStage.DECLINED);

    return this.composeDto(row as unknown as RoadmapItemRow, actorUid, access);
  }

  async transitionItem(uid: string, body: TransitionBody, actorUid: string) {
    return this.applyStageChange(uid, body.stage as RoadmapStage, actorUid, {
      requireTransitionPerm: true,
      declinedReason: undefined,
    });
  }

  isPinnableStage(stage: RoadmapStage): boolean {
    return PINNABLE_STAGES.includes(stage);
  }

  /** Pins are only allowed while an item is in a pinnable stage; counts are frozen elsewhere. */
  assertStageAllowsSignals(stage: RoadmapStage): void {
    if (!this.isPinnableStage(stage)) {
      throw new BadRequestException({
        message: `Items in stage ${stage} cannot be pinned; counts are frozen`,
        code: 'ITEM_NOT_PINNABLE',
      });
    }
  }

  async trackBuildButtonClick(uid: string, actorUid: string) {
    await this.findActiveOrThrow(uid);
    await this.track(ROADMAP_ANALYTICS_EVENTS.BUILD_BUTTON_CLICKED, actorUid, { itemUid: uid });
  }

  private async applyStageChange(
    uid: string,
    to: RoadmapStage,
    actorUid: string,
    opts: { requireTransitionPerm: boolean; setPromoted?: boolean; declinedReason?: string }
  ) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (opts.requireTransitionPerm && !access.canTransition) {
      throw new ForbiddenException('Missing permission to change item stage');
    }
    assertTransitionAllowed(existing.stage, to);

    const data: Prisma.RoadmapItemUpdateInput = { stage: to };
    if (opts.setPromoted || isPromoteTransition(existing.stage, to)) {
      data.promotedAt = new Date();
      data.promotedBy = { connect: { uid: actorUid } };
      data.declinedReason = null;
    }
    if (isDeclineTransition(to) && opts.declinedReason) {
      data.declinedReason = opts.declinedReason;
    }
    if (to !== RoadmapStage.DECLINED) {
      data.declinedReason = null;
    }

    const { row, releasedPins } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.roadmapItem.update({
        where: { uid },
        data,
        include: itemInclude,
      });
      const released = PIN_RELEASING_STAGES.includes(to) ? await this.releaseActivePins(tx, uid) : [];
      return { row: updated, releasedPins: released };
    });

    await this.trackPinsReleased(uid, actorUid, releasedPins, to);

    // Committed-stage notifications fire at most once per item. We derive "already
    // notified" from the persisted bell notifications themselves (metadata.itemUid +
    // trigger), not from item state, so a re-entry can never re-notify:
    //   - In Progress is suppressed if the item was ever In Progress OR Shipped — covers
    //     Planned → In Progress → Planned → In Progress and Shipped → In Progress bounces.
    //   - Shipped is suppressed if the item was ever Shipped.
    // (Pins also release exactly once, so an IN_PROGRESS → SHIPPED move releases nothing
    // and the boost-returned line can't repeat regardless.)
    const reachedInProgressBefore =
      to === RoadmapStage.IN_PROGRESS &&
      (await this.pushNotifications.hasItemTriggerNotification(uid, REACHED_IN_PROGRESS_NOTIFICATION_TRIGGERS));
    const reachedShippedBefore =
      to === RoadmapStage.SHIPPED &&
      (await this.pushNotifications.hasItemTriggerNotification(uid, SHIPPED_NOTIFICATION_TRIGGERS));

    if (to === RoadmapStage.IN_PROGRESS && !reachedInProgressBefore) {
      await this.notifyBoostsReturned(row, releasedPins);
    }

    if (existing.stage !== to) {
      const suppressForRepeat =
        (to === RoadmapStage.IN_PROGRESS && reachedInProgressBefore) ||
        (to === RoadmapStage.SHIPPED && reachedShippedBefore);
      if (!suppressForRepeat) {
        await this.notifySubmitterStageChange(row, to, opts.declinedReason);
      }
    }

    if (isPromoteTransition(existing.stage, to)) {
      await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_PROMOTED, actorUid, { itemUid: uid });
    } else if (to !== RoadmapStage.SHIPPED) {
      await this.track(ROADMAP_ANALYTICS_EVENTS.ROADMAP_STATUS_CHANGED, actorUid, {
        itemUid: uid,
        from: existing.stage,
        to,
      });
    }

    return this.composeDto(row as unknown as RoadmapItemRow, actorUid, access);
  }

  /** Releases all active pins on an item and returns the uids of the members whose pin was just returned. */
  private async releaseActivePins(tx: Prisma.TransactionClient, itemUid: string): Promise<string[]> {
    const active = await tx.roadmapItemPin.findMany({
      where: { itemUid, releasedAt: null },
      select: { memberUid: true },
    });
    await tx.roadmapItemPin.updateMany({
      where: { itemUid, releasedAt: null },
      data: { releasedAt: new Date() },
    });
    return active.map((pin) => pin.memberUid);
  }

  private async trackPinsReleased(itemUid: string, actorUid: string, releasedPins: string[], reason: string) {
    if (releasedPins.length > 0) {
      await this.track(ROADMAP_ANALYTICS_EVENTS.PINS_RELEASED, actorUid, {
        itemUid,
        count: releasedPins.length,
        reason,
      });
    }
  }

  private buildListWhere(query: ListQuery, viewerUid: string): Prisma.RoadmapItemWhereInput {
    const where: Prisma.RoadmapItemWhereInput = {};

    if (!query.includeArchived) {
      where.deletedAt = null;
    }

    if (query.mine) {
      where.createdByUid = viewerUid;
    }

    if (query.focusArea) {
      where.focusArea = query.focusArea;
    }

    const objectiveUids = query.objectiveUid as string[] | undefined;
    if (objectiveUids?.length) {
      where.objectives = { some: { objectiveUid: { in: objectiveUids } } };
    }

    if (query.type) {
      where.type = query.type;
    }

    const tags = query.tags as string[] | undefined;
    if (tags?.length) {
      where.tags = { hasSome: tags };
    }

    const stages = query.stage as RoadmapStage[] | undefined;
    if (stages?.length) {
      where.stage = { in: stages };
    } else if (!query.includeDeclined) {
      where.stage = { not: RoadmapStage.DECLINED };
    }

    return where;
  }

  private async findActiveOrThrow(uid: string): Promise<RoadmapItemRow> {
    const row = await this.prisma.roadmapItem.findFirst({
      where: { uid, deletedAt: null },
      include: itemInclude,
    });
    if (!row) {
      throw new NotFoundException(`Roadmap item ${uid} not found`);
    }
    return row as unknown as RoadmapItemRow;
  }

  /** Builds the item DTO, fetching the viewer's pin state, active pin count, and (for curators) the pinner list. */
  private async composeDto(row: RoadmapItemRow, viewerUid: string, access?: MemberAccess) {
    const memberAccess = access ?? (await this.getMemberAccess(viewerUid));

    if (memberAccess.canCurate) {
      const pins = await this.prisma.roadmapItemPin.findMany({
        where: { itemUid: row.uid },
        select: adminPinSelect,
      });
      const activePins = pins.filter((pin) => !pin.releasedAt);
      const viewerPin = activePins.find((pin) => pin.member.uid === viewerUid);
      return this.toDto(
        row,
        viewerUid,
        {
          viewerHasPinned: !!viewerPin,
          viewerPinNote: viewerPin?.note ?? null,
          activePinCount: activePins.length,
        },
        toAdminPinList(pins)
      );
    }

    const [viewerPin, activePinCount] = await Promise.all([
      this.prisma.roadmapItemPin.findFirst({
        where: { itemUid: row.uid, memberUid: viewerUid, releasedAt: null },
        select: { note: true },
      }),
      this.prisma.roadmapItemPin.count({ where: { itemUid: row.uid, releasedAt: null } }),
    ]);
    return this.toDto(
      row,
      viewerUid,
      {
        viewerHasPinned: !!viewerPin,
        viewerPinNote: viewerPin?.note ?? null,
        activePinCount,
      },
      null
    );
  }

  private toDto(
    row: RoadmapItemRow,
    _viewerUid: string,
    pinState: ViewerPinState,
    adminPins: AdminPinDto[] | null = null
  ) {
    return {
      uid: row.uid,
      title: row.title,
      description: row.description,
      acceptanceCriteria: row.acceptanceCriteria,
      stage: row.stage,
      focusArea: row.focusArea,
      type: row.type,
      tags: row.tags,
      order: row.order,
      createdByUid: row.createdByUid,
      createdBy: {
        uid: row.createdBy.uid,
        name: row.createdBy.name,
        imageUrl: row.createdBy.image?.url ?? null,
      },
      promotedAt: row.promotedAt?.toISOString() ?? null,
      promotedByUid: row.promotedByUid,
      declinedReason: row.declinedReason,
      externalTrackerUrl: row.externalTrackerUrl,
      objectives: row.objectives.map((link) => ({
        uid: link.objective.uid,
        title: link.objective.title,
        order: link.objective.order,
      })),
      upvoteCount: 0,
      viewerHasUpvoted: false,
      pinCount: this.isPinnableStage(row.stage) ? pinState.activePinCount : row._count.pins,
      viewerHasPinned: pinState.viewerHasPinned,
      viewerPinNote: pinState.viewerPinNote,
      pins: adminPins,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /**
   * Tell the original submitter their need moved to a new stage. Every stage has a
   * dedicated line except moves back to IDEA (curator corrections — intentionally
   * silent). Declines through the dedicated decline endpoint carry the curator's
   * reason; a raw transition to DECLINED falls back to a generic one.
   */
  private async notifySubmitterStageChange(
    item: { uid: string; title: string; createdByUid: string },
    to: RoadmapStage,
    declinedReason?: string
  ) {
    switch (to) {
      case RoadmapStage.PLANNED:
        return this.sendMemberNotification(
          item.createdByUid,
          ROADMAP_NOTIFICATION_COPY.needPlanned(item.title),
          item.uid,
          ROADMAP_NOTIFICATION_TRIGGERS.NEED_PLANNED
        );
      case RoadmapStage.IN_PROGRESS:
        return this.sendMemberNotification(
          item.createdByUid,
          ROADMAP_NOTIFICATION_COPY.needInProgress(item.title),
          item.uid,
          ROADMAP_NOTIFICATION_TRIGGERS.NEED_IN_PROGRESS
        );
      case RoadmapStage.BACKLOG:
        return this.sendMemberNotification(
          item.createdByUid,
          ROADMAP_NOTIFICATION_COPY.needBacklogged(item.title),
          item.uid,
          ROADMAP_NOTIFICATION_TRIGGERS.NEED_BACKLOGGED
        );
      case RoadmapStage.SHIPPED:
        return this.notifyShipped(item);
      case RoadmapStage.DECLINED:
        return this.notifyDeclined(item, declinedReason ?? 'No reason provided.');
      default:
        return;
    }
  }

  private async notifyDeclined(item: { uid: string; title: string; createdByUid: string }, reason: string) {
    await this.sendMemberNotification(
      item.createdByUid,
      ROADMAP_NOTIFICATION_COPY.needDeclined(item.title, reason),
      item.uid,
      ROADMAP_NOTIFICATION_TRIGGERS.NEED_DECLINED
    );
  }

  /**
   * Broadcast that an item shipped to everyone with roadmap access. One permission-gated
   * notification (same fan-out as new submissions). No authorUid — the submitter should
   * see it too when they hold roadmap.view.
   */
  private async notifyShipped(item: { uid: string; title: string }) {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.GANTRY,
        ...ROADMAP_NOTIFICATION_COPY.needShipped(item.title),
        link: itemDetailPath(item.uid),
        isPublic: false,
        requiredPermissions: [ROADMAP_PERMISSIONS.VIEW, ROADMAP_PERMISSIONS.ADMIN],
        metadata: {
          eventType: 'roadmap',
          itemUid: item.uid,
          trigger: ROADMAP_NOTIFICATION_TRIGGERS.NEED_SHIPPED,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Roadmap shipped notification failed for ${item.uid}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /**
   * PRD §7 trigger 1 — broadcast a new submission to everyone with roadmap access.
   * One permission-gated notification: holders of roadmap.view see it; roadmap.admin
   * is listed too because the websocket fan-out matches raw permission codes without
   * expanding the aggregate.
   */
  private async notifyNewSubmission(item: { uid: string; title: string }, authorUid: string) {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.GANTRY,
        ...ROADMAP_NOTIFICATION_COPY.newSubmission(item.title),
        link: itemDetailPath(item.uid),
        isPublic: false,
        requiredPermissions: [ROADMAP_PERMISSIONS.VIEW, ROADMAP_PERMISSIONS.ADMIN],
        metadata: {
          eventType: 'roadmap',
          itemUid: item.uid,
          trigger: ROADMAP_NOTIFICATION_TRIGGERS.NEW_SUBMISSION,
          authorUid,
        },
      });
    } catch (error) {
      this.logger.warn(
        `Roadmap new-submission notification failed for ${item.uid}: ${error instanceof Error ? error.message : error}`
      );
    }
  }

  /** PRD §7 trigger 2 — tell each member whose pin was just auto-released that their boost is back. */
  private async notifyBoostsReturned(
    item: { uid: string; title: string; createdByUid: string },
    releasedMemberUids: string[]
  ) {
    const recipients = releasedMemberUids.filter((memberUid) => memberUid !== item.createdByUid);
    for (const memberUid of recipients) {
      await this.sendMemberNotification(
        memberUid,
        ROADMAP_NOTIFICATION_COPY.boostReturned(item.title),
        item.uid,
        ROADMAP_NOTIFICATION_TRIGGERS.BOOST_RETURNED
      );
    }
  }

  private async sendMemberNotification(
    recipientUid: string,
    copy: { title: string; description: string },
    itemUid: string,
    trigger?: string
  ) {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.GANTRY,
        ...copy,
        link: itemDetailPath(itemUid),
        recipientUid,
        isPublic: false,
        metadata: { eventType: 'roadmap', itemUid, ...(trigger ? { trigger } : {}) },
      });
    } catch (error) {
      this.logger.warn(`Roadmap notification failed for ${itemUid}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async track(name: string, distinctId: string, properties: Record<string, unknown>) {
    await this.analytics.trackEvent({ name, distinctId, properties });
  }
}

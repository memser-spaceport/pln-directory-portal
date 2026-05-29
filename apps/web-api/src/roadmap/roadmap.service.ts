import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PushNotificationCategory, RoadmapItem, RoadmapStage } from '@prisma/client';
import {
  ArchiveRoadmapItemSchema,
  CreateRoadmapItemSchema,
  DeclineRoadmapItemSchema,
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
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { assertTransitionAllowed, isDeclineTransition, isIdeaStage, isPromoteTransition } from './roadmap-stage.util';

type CreateBody = z.infer<typeof CreateRoadmapItemSchema>;
type UpdateBody = z.infer<typeof UpdateRoadmapItemSchema>;
type ListQuery = z.infer<typeof RoadmapItemListQueryParams>;
type ArchiveBody = z.infer<typeof ArchiveRoadmapItemSchema>;
type DeclineBody = z.infer<typeof DeclineRoadmapItemSchema>;
type TransitionBody = z.infer<typeof TransitionRoadmapItemSchema>;

type MemberAccess = {
  canEditOwn: boolean;
  canCurate: boolean;
  canTransition: boolean;
};

const itemInclude: Prisma.RoadmapItemInclude = {
  createdBy: { select: { uid: true, name: true, image: { select: { url: true } } } },
  promotedBy: { select: { uid: true, name: true } },
  _count: { select: { upvotes: true } },
};

interface RoadmapItemRow {
  uid: string;
  title: string;
  description: string;
  acceptanceCriteria: string | null;
  stage: RoadmapStage;
  focusArea: string | null;
  createdByUid: string;
  createdBy: { uid: string; name: string; image: { url: string } | null };
  promotedAt: Date | null;
  promotedByUid: string | null;
  declinedReason: string | null;
  externalTrackerUrl: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { upvotes: number };
}

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
    const rows = await this.prisma.roadmapItem.findMany({
      where,
      include: {
        ...itemInclude,
        upvotes: { where: { memberUid: viewerUid }, select: { uid: true }, take: 1 },
      },
    });

    const sorted = (rows as unknown as (RoadmapItemRow & { upvotes: { uid: string }[] })[]).sort((a, b) => {
      const countDiff = b._count.upvotes - a._count.upvotes;
      if (countDiff !== 0) return countDiff;
      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });

    return {
      items: sorted.map((row) => this.toDto(row, viewerUid, row.upvotes.length > 0)),
      total: sorted.length,
    };
  }

  async getItem(uid: string, viewerUid: string) {
    const row = await this.findActiveOrThrow(uid);
    const viewerUpvote = await this.prisma.roadmapItemUpvote.findUnique({
      where: { itemUid_memberUid: { itemUid: uid, memberUid: viewerUid } },
      select: { uid: true },
    });
    return this.toDto(row as unknown as RoadmapItemRow, viewerUid, !!viewerUpvote);
  }

  async createItem(body: CreateBody, actorUid: string) {
    const access = await this.getMemberAccess(actorUid);
    let stage: RoadmapStage = RoadmapStage.IDEA;

    if (body.stage && body.stage !== 'IDEA') {
      if (!access.canCurate) {
        throw new ForbiddenException('Only the product team can create roadmap-stage items directly');
      }
      const directStages: RoadmapStage[] = [RoadmapStage.PLANNED, RoadmapStage.IN_PROGRESS];
      if (!directStages.includes(body.stage as RoadmapStage)) {
        throw new BadRequestException('Direct create supports PLANNED or IN_PROGRESS only');
      }
      stage = body.stage as RoadmapStage;
    }

    const row = await this.prisma.roadmapItem.create({
      data: {
        title: body.title,
        description: body.description,
        acceptanceCriteria: body.acceptanceCriteria ?? null,
        focusArea: body.focusArea ?? null,
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

    return this.toDto(row as unknown as RoadmapItemRow, actorUid, false);
  }

  async updateItem(uid: string, body: UpdateBody, actorUid: string) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (!this.canEditItem(existing, actorUid, access)) {
      throw new ForbiddenException('You cannot edit this item');
    }

    const row = await this.prisma.roadmapItem.update({
      where: { uid },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.acceptanceCriteria !== undefined ? { acceptanceCriteria: body.acceptanceCriteria } : {}),
        ...(body.focusArea !== undefined ? { focusArea: body.focusArea } : {}),
        ...(body.externalTrackerUrl !== undefined ? { externalTrackerUrl: body.externalTrackerUrl } : {}),
      },
      include: itemInclude,
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_UPDATED, actorUid, { itemUid: uid });
    const viewerUpvote = await this.hasViewerUpvoted(uid, actorUid);
    return this.toDto(row as unknown as RoadmapItemRow, actorUid, viewerUpvote);
  }

  async archiveItem(uid: string, body: ArchiveBody, actorUid: string) {
    const existing = await this.findActiveOrThrow(uid);
    const access = await this.getMemberAccess(actorUid);
    if (!this.canEditItem(existing, actorUid, access)) {
      throw new ForbiddenException('You cannot archive this item');
    }

    const row = await this.prisma.roadmapItem.update({
      where: { uid },
      data: {
        deletedAt: new Date(),
        deletionReason: body.deletionReason ?? null,
      },
      include: itemInclude,
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_ARCHIVED, actorUid, { itemUid: uid });
    return this.toDto(row as unknown as RoadmapItemRow, actorUid, false);
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

    const row = await this.prisma.roadmapItem.update({
      where: { uid },
      data: {
        stage: RoadmapStage.DECLINED,
        declinedReason: body.reason,
      },
      include: itemInclude,
    });

    await this.notifyDeclined(row, body.reason);
    await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_DECLINED, actorUid, {
      itemUid: uid,
      reason: body.reason,
    });

    const viewerUpvote = await this.hasViewerUpvoted(uid, actorUid);
    return this.toDto(row as unknown as RoadmapItemRow, actorUid, viewerUpvote);
  }

  async transitionItem(uid: string, body: TransitionBody, actorUid: string) {
    return this.applyStageChange(uid, body.stage as RoadmapStage, actorUid, {
      requireTransitionPerm: true,
      declinedReason: undefined,
    });
  }

  async addUpvote(uid: string, note: string | null | undefined, actorUid: string) {
    await this.findActiveOrThrow(uid);
    await this.prisma.roadmapItemUpvote.upsert({
      where: { itemUid_memberUid: { itemUid: uid, memberUid: actorUid } },
      create: { itemUid: uid, memberUid: actorUid, note: note ?? null },
      update: { note: note ?? null },
    });
    await this.track(ROADMAP_ANALYTICS_EVENTS.ITEM_UPVOTED, actorUid, { itemUid: uid });
    return this.getItem(uid, actorUid);
  }

  async removeUpvote(uid: string, actorUid: string) {
    await this.findActiveOrThrow(uid);
    await this.prisma.roadmapItemUpvote.deleteMany({
      where: { itemUid: uid, memberUid: actorUid },
    });
    await this.track(ROADMAP_ANALYTICS_EVENTS.UPVOTE_REMOVED, actorUid, { itemUid: uid });
    return this.getItem(uid, actorUid);
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

    const row = await this.prisma.roadmapItem.update({
      where: { uid },
      data,
      include: itemInclude,
    });

    if (isPromoteTransition(existing.stage, to)) {
      await this.notifyPromoted(row);
      await this.track(ROADMAP_ANALYTICS_EVENTS.IDEA_PROMOTED, actorUid, { itemUid: uid });
    } else if (to === RoadmapStage.SHIPPED) {
      await this.notifyShipped(row);
    } else {
      await this.track(ROADMAP_ANALYTICS_EVENTS.ROADMAP_STATUS_CHANGED, actorUid, {
        itemUid: uid,
        from: existing.stage,
        to,
      });
    }

    const viewerUpvote = await this.hasViewerUpvoted(uid, actorUid);
    return this.toDto(row as unknown as RoadmapItemRow, actorUid, viewerUpvote);
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

  private async hasViewerUpvoted(itemUid: string, memberUid: string) {
    const row = await this.prisma.roadmapItemUpvote.findUnique({
      where: { itemUid_memberUid: { itemUid, memberUid } },
      select: { uid: true },
    });
    return !!row;
  }

  private toDto(row: RoadmapItemRow, _viewerUid: string, viewerHasUpvoted: boolean) {
    return {
      uid: row.uid,
      title: row.title,
      description: row.description,
      acceptanceCriteria: row.acceptanceCriteria,
      stage: row.stage,
      focusArea: row.focusArea,
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
      upvoteCount: row._count.upvotes,
      viewerHasUpvoted,
      deletedAt: row.deletedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async notifyPromoted(item: { uid: string; title: string; createdByUid: string }) {
    await this.sendCreatorNotification(item.createdByUid, `Your idea "${item.title}" is now on the roadmap.`, item.uid);
  }

  private async notifyDeclined(item: { uid: string; title: string; createdByUid: string }, reason: string) {
    await this.sendCreatorNotification(
      item.createdByUid,
      `Your idea "${item.title}" was not taken forward. Reason: ${reason}`,
      item.uid
    );
  }

  private async notifyShipped(item: { uid: string; title: string; createdByUid: string }) {
    await this.sendCreatorNotification(item.createdByUid, `"${item.title}" has shipped.`, item.uid);
  }

  private async sendCreatorNotification(recipientUid: string, title: string, itemUid: string) {
    try {
      await this.pushNotifications.create({
        category: PushNotificationCategory.SYSTEM,
        title,
        link: `/roadmap/items/${itemUid}`,
        recipientUid,
        isPublic: false,
        metadata: { eventType: 'roadmap', itemUid },
      });
    } catch (error) {
      this.logger.warn(`Roadmap notification failed for ${itemUid}: ${error instanceof Error ? error.message : error}`);
    }
  }

  private async track(name: string, distinctId: string, properties: Record<string, unknown>) {
    await this.analytics.trackEvent({ name, distinctId, properties });
  }
}

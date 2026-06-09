import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinRoadmapItemSchema, UpdateRoadmapSettingsSchema } from 'libs/contracts/src/schema/roadmap';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { DEFAULT_PIN_LIMIT, ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { RoadmapService } from './roadmap.service';

type PinBody = z.infer<typeof PinRoadmapItemSchema>;
type SettingsBody = z.infer<typeof UpdateRoadmapSettingsSchema>;

const pinnerMemberSelect = {
  member: { select: { uid: true, name: true, image: { select: { url: true } } } },
} as const;

@Injectable()
export class RoadmapPinsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roadmapService: RoadmapService,
    private readonly analytics: AnalyticsService
  ) {}

  async pinItem(uid: string, body: PinBody, actorUid: string) {
    const limit = await this.getPinLimit();

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.roadmapItem.findFirst({
        where: { uid, deletedAt: null },
        select: { uid: true, stage: true },
      });
      if (!item) {
        throw new NotFoundException(`Roadmap item ${uid} not found`);
      }
      this.roadmapService.assertStageAllowsSignals(item.stage, 'pin');

      const existingPin = await tx.roadmapItemPin.findFirst({
        where: { itemUid: uid, memberUid: actorUid, releasedAt: null },
        select: { uid: true },
      });
      if (existingPin) {
        if (body.note !== undefined) {
          await tx.roadmapItemPin.update({ where: { uid: existingPin.uid }, data: { note: body.note ?? null } });
        }
        return;
      }

      if (body.swapItemUid) {
        if (body.swapItemUid === uid) {
          throw new BadRequestException('swapItemUid must reference a different item');
        }
        const swapped = await tx.roadmapItemPin.deleteMany({
          where: { itemUid: body.swapItemUid, memberUid: actorUid, releasedAt: null },
        });
        if (swapped.count === 0) {
          throw new NotFoundException(`No active pin to swap on item ${body.swapItemUid}`);
        }
      }

      const used = await tx.roadmapItemPin.count({ where: { memberUid: actorUid, releasedAt: null } });
      if (used >= limit) {
        throw new ConflictException({
          message: 'All pins are in use. Unpin one to pin this item.',
          code: 'PIN_BALANCE_EXHAUSTED',
        });
      }

      await tx.roadmapItemPin.create({
        data: { itemUid: uid, memberUid: actorUid, note: body.note ?? null },
      });

      // Pinning implies a like; `update: {}` keeps an existing upvote (and its note) untouched.
      await tx.roadmapItemUpvote.upsert({
        where: { itemUid_memberUid: { itemUid: uid, memberUid: actorUid } },
        create: { itemUid: uid, memberUid: actorUid, note: null },
        update: {},
      });
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.ITEM_PINNED, actorUid, {
      itemUid: uid,
      swapItemUid: body.swapItemUid ?? null,
    });
    return this.pinActionResponse(uid, actorUid);
  }

  async unpinItem(uid: string, actorUid: string) {
    const result = await this.prisma.roadmapItemPin.deleteMany({
      where: { itemUid: uid, memberUid: actorUid, releasedAt: null },
    });
    if (result.count === 0) {
      throw new NotFoundException(`No active pin on item ${uid}`);
    }
    await this.track(ROADMAP_ANALYTICS_EVENTS.ITEM_UNPINNED, actorUid, { itemUid: uid });
    return this.pinActionResponse(uid, actorUid);
  }

  async updatePinNote(uid: string, note: string | null, actorUid: string) {
    const pin = await this.prisma.roadmapItemPin.findFirst({
      where: { itemUid: uid, memberUid: actorUid, releasedAt: null },
      select: { uid: true },
    });
    if (!pin) {
      throw new NotFoundException(`No active pin on item ${uid}`);
    }
    await this.prisma.roadmapItemPin.update({ where: { uid: pin.uid }, data: { note } });
    await this.track(ROADMAP_ANALYTICS_EVENTS.PIN_NOTE_UPDATED, actorUid, { itemUid: uid });
    return this.pinActionResponse(uid, actorUid);
  }

  async getMyBalance(actorUid: string) {
    const [limit, pins] = await Promise.all([
      this.getPinLimit(),
      this.prisma.roadmapItemPin.findMany({
        where: { memberUid: actorUid, releasedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          uid: true,
          note: true,
          createdAt: true,
          item: { select: { uid: true, title: true, stage: true } },
        },
      }),
    ]);

    return {
      limit,
      used: pins.length,
      remaining: Math.max(0, limit - pins.length),
      pins: pins.map((pin) => ({
        uid: pin.uid,
        note: pin.note,
        createdAt: pin.createdAt.toISOString(),
        item: pin.item,
      })),
    };
  }

  async listItemPinners(uid: string, actorUid: string) {
    await this.assertCurator(actorUid);
    await this.assertItemExists(uid);

    const pins = await this.prisma.roadmapItemPin.findMany({
      where: { itemUid: uid },
      select: { uid: true, note: true, createdAt: true, releasedAt: true, ...pinnerMemberSelect },
    });

    // Active pins first, then most recent.
    pins.sort((a, b) => {
      if (!a.releasedAt !== !b.releasedAt) return a.releasedAt ? 1 : -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });

    return {
      total: pins.length,
      pins: pins.map((pin) => ({
        uid: pin.uid,
        note: pin.note,
        createdAt: pin.createdAt.toISOString(),
        releasedAt: pin.releasedAt?.toISOString() ?? null,
        member: this.toMemberSummary(pin.member),
      })),
    };
  }

  async listItemUpvoters(uid: string, actorUid: string) {
    await this.assertCurator(actorUid);
    await this.assertItemExists(uid);

    const upvotes = await this.prisma.roadmapItemUpvote.findMany({
      where: { itemUid: uid },
      orderBy: { createdAt: 'desc' },
      select: { uid: true, note: true, createdAt: true, ...pinnerMemberSelect },
    });

    return {
      total: upvotes.length,
      upvotes: upvotes.map((upvote) => ({
        uid: upvote.uid,
        note: upvote.note,
        createdAt: upvote.createdAt.toISOString(),
        member: this.toMemberSummary(upvote.member),
      })),
    };
  }

  async getSettings() {
    return { pinLimit: await this.getPinLimit() };
  }

  async updateSettings(body: SettingsBody, actorUid: string) {
    await this.assertCurator(actorUid);
    const settings = await this.prisma.roadmapSettings.upsert({
      where: { id: 1 },
      create: { id: 1, pinLimit: body.pinLimit, updatedByUid: actorUid },
      update: { pinLimit: body.pinLimit, updatedByUid: actorUid },
    });
    await this.track(ROADMAP_ANALYTICS_EVENTS.PIN_LIMIT_CHANGED, actorUid, { pinLimit: body.pinLimit });
    return { pinLimit: settings.pinLimit };
  }

  private async getPinLimit(): Promise<number> {
    const settings = await this.prisma.roadmapSettings.upsert({
      where: { id: 1 },
      create: { id: 1, pinLimit: DEFAULT_PIN_LIMIT },
      update: {},
    });
    return settings.pinLimit;
  }

  private async pinActionResponse(uid: string, actorUid: string) {
    const [item, balance] = await Promise.all([
      this.roadmapService.getItem(uid, actorUid),
      this.balanceSummary(actorUid),
    ]);
    return { item, balance };
  }

  private async balanceSummary(actorUid: string) {
    const [limit, used] = await Promise.all([
      this.getPinLimit(),
      this.prisma.roadmapItemPin.count({ where: { memberUid: actorUid, releasedAt: null } }),
    ]);
    return { limit, used, remaining: Math.max(0, limit - used) };
  }

  private async assertCurator(actorUid: string) {
    const access = await this.roadmapService.getMemberAccess(actorUid);
    if (!access.canCurate) {
      throw new ForbiddenException('Only the product team can access this resource');
    }
  }

  /** Admin views may inspect archived items too, so no deletedAt filter here. */
  private async assertItemExists(uid: string) {
    const item = await this.prisma.roadmapItem.findUnique({ where: { uid }, select: { uid: true } });
    if (!item) {
      throw new NotFoundException(`Roadmap item ${uid} not found`);
    }
  }

  private toMemberSummary(member: { uid: string; name: string; image: { url: string } | null }) {
    return { uid: member.uid, name: member.name, imageUrl: member.image?.url ?? null };
  }

  private async track(name: string, distinctId: string, properties: Record<string, unknown>) {
    await this.analytics.trackEvent({ name, distinctId, properties });
  }
}

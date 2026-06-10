import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateRoadmapObjectiveSchema, SetRoadmapItemObjectiveSchema } from 'libs/contracts/src/schema/roadmap';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { RoadmapService } from './roadmap.service';

type CreateObjectiveBody = z.infer<typeof CreateRoadmapObjectiveSchema>;
type SetObjectiveBody = z.infer<typeof SetRoadmapItemObjectiveSchema>;

@Injectable()
export class RoadmapObjectivesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roadmapService: RoadmapService,
    private readonly analytics: AnalyticsService
  ) {}

  async listObjectives() {
    const rows = await this.prisma.roadmapObjective.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    return {
      objectives: rows.map((row) => ({
        uid: row.uid,
        title: row.title,
        order: row.order,
        itemCount: row._count.items,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  async createObjective(body: CreateObjectiveBody, actorUid: string) {
    await this.assertCurator(actorUid);
    const { objective, created } = await this.findOrCreateByTitle(body.title, actorUid);
    if (created) {
      await this.track(ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_CREATED, actorUid, { objectiveUid: objective.uid });
    }
    const itemCount = await this.prisma.roadmapItem.count({
      where: { objectiveUid: objective.uid, deletedAt: null },
    });
    return {
      uid: objective.uid,
      title: objective.title,
      order: objective.order,
      itemCount,
      createdAt: objective.createdAt.toISOString(),
    };
  }

  async setItemObjective(uid: string, body: SetObjectiveBody, actorUid: string) {
    await this.assertCurator(actorUid);

    const item = await this.prisma.roadmapItem.findFirst({
      where: { uid, deletedAt: null },
      select: { uid: true },
    });
    if (!item) {
      throw new NotFoundException(`Roadmap item ${uid} not found`);
    }

    let objectiveUid: string | null = null;
    if (body.title !== undefined) {
      const { objective, created } = await this.findOrCreateByTitle(body.title, actorUid);
      if (created) {
        await this.track(ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_CREATED, actorUid, { objectiveUid: objective.uid });
      }
      objectiveUid = objective.uid;
    } else if (body.objectiveUid) {
      const objective = await this.prisma.roadmapObjective.findUnique({
        where: { uid: body.objectiveUid },
        select: { uid: true },
      });
      if (!objective) {
        throw new NotFoundException(`Objective ${body.objectiveUid} not found`);
      }
      objectiveUid = objective.uid;
    }

    await this.prisma.roadmapItem.update({ where: { uid }, data: { objectiveUid } });
    await this.track(ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_SET, actorUid, { itemUid: uid, objectiveUid });
    return this.roadmapService.getItem(uid, actorUid);
  }

  private async findOrCreateByTitle(title: string, actorUid: string) {
    const trimmed = title.trim();
    const existing = await this.prisma.roadmapObjective.findFirst({
      where: { title: { equals: trimmed, mode: 'insensitive' } },
    });
    if (existing) {
      return { objective: existing, created: false };
    }
    try {
      const objective = await this.prisma.roadmapObjective.create({
        data: { title: trimmed, createdByUid: actorUid },
      });
      return { objective, created: true };
    } catch (error) {
      // Lost a create race on the unique title — fall back to the winner's row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const objective = await this.prisma.roadmapObjective.findFirst({
          where: { title: { equals: trimmed, mode: 'insensitive' } },
        });
        if (objective) {
          return { objective, created: false };
        }
      }
      throw error;
    }
  }

  private async assertCurator(actorUid: string) {
    const access = await this.roadmapService.getMemberAccess(actorUid);
    if (!access.canCurate) {
      throw new ForbiddenException('Only the product team can manage objectives');
    }
  }

  private async track(name: string, distinctId: string, properties: Record<string, unknown>) {
    await this.analytics.trackEvent({ name, distinctId, properties });
  }
}

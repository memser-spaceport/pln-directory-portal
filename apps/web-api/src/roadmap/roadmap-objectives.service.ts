import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateRoadmapObjectiveSchema, SetRoadmapItemObjectivesSchema } from 'libs/contracts/src/schema/roadmap';
import { z } from 'zod';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { ROADMAP_ANALYTICS_EVENTS } from './roadmap.constants';
import { RoadmapService } from './roadmap.service';

type CreateObjectiveBody = z.infer<typeof CreateRoadmapObjectiveSchema>;
type SetObjectivesBody = z.infer<typeof SetRoadmapItemObjectivesSchema>;

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
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    const activeCounts = await this.prisma.roadmapItemObjective.groupBy({
      by: ['objectiveUid'],
      where: { item: { deletedAt: null } },
      _count: { _all: true },
    });
    const activeCountByUid = new Map(activeCounts.map((row) => [row.objectiveUid, row._count._all]));

    return {
      objectives: rows.map((row) => ({
        uid: row.uid,
        title: row.title,
        order: row.order,
        itemCount: activeCountByUid.get(row.uid) ?? 0,
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
    const itemCount = await this.prisma.roadmapItemObjective.count({
      where: { objectiveUid: objective.uid, item: { deletedAt: null } },
    });
    return {
      uid: objective.uid,
      title: objective.title,
      order: objective.order,
      itemCount,
      createdAt: objective.createdAt.toISOString(),
    };
  }

  async setItemObjectives(uid: string, body: SetObjectivesBody, actorUid: string) {
    await this.assertCurator(actorUid);

    const item = await this.prisma.roadmapItem.findFirst({
      where: { uid, deletedAt: null },
      select: { uid: true },
    });
    if (!item) {
      throw new NotFoundException(`Roadmap item ${uid} not found`);
    }

    const desiredUids = new Set(body.objectiveUids ?? []);

    for (const title of body.titles ?? []) {
      const { objective, created } = await this.findOrCreateByTitle(title, actorUid);
      if (created) {
        await this.track(ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_CREATED, actorUid, { objectiveUid: objective.uid });
      }
      desiredUids.add(objective.uid);
    }

    const objectiveUids = [...desiredUids];

    if (objectiveUids.length > 0) {
      const found = await this.prisma.roadmapObjective.findMany({
        where: { uid: { in: objectiveUids } },
        select: { uid: true },
      });
      const foundSet = new Set(found.map((o) => o.uid));
      const missing = objectiveUids.filter((id) => !foundSet.has(id));
      if (missing.length > 0) {
        throw new NotFoundException(`Objective ${missing[0]} not found`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.roadmapItemObjective.deleteMany({
        where: {
          itemUid: uid,
          ...(objectiveUids.length > 0 ? { objectiveUid: { notIn: objectiveUids } } : {}),
        },
      });

      if (objectiveUids.length === 0) {
        return;
      }

      await tx.roadmapItemObjective.createMany({
        data: objectiveUids.map((objectiveUid) => ({ itemUid: uid, objectiveUid })),
        skipDuplicates: true,
      });
    });

    await this.track(ROADMAP_ANALYTICS_EVENTS.OBJECTIVE_SET, actorUid, { itemUid: uid, objectiveUids });
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

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { CrosswalkReviewQueryDto, ListPathfinderPathsQueryDto } from './dto/pathfinder.query.dto';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parsePage(value: string | undefined): number {
  const n = parseInt(value ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseLimit(value: string | undefined): number {
  const n = parseInt(value ?? String(DEFAULT_LIMIT), 10);
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

/**
 * PL Path Finder read-side service. Returns the standard pagination envelope
 * `{ page, limit, total, items }` (AGENTS.md rule 19).
 */
@Injectable()
export class PathfinderQueryService {
  constructor(private readonly prisma: PrismaService) {}

  async listPaths(query: ListPathfinderPathsQueryDto) {
    const page = parsePage(query.page);
    const limit = parseLimit(query.limit);

    const where: Prisma.PathfinderPathWhereInput = {};
    if (query.targetInvestorId) where.targetInvestorId = query.targetInvestorId;
    if (query.targetSet) where.targetSet = query.targetSet;
    if (query.connectorType) where.connectorType = query.connectorType;

    const [total, items] = await this.prisma.$transaction([
      this.prisma.pathfinderPath.count({ where }),
      this.prisma.pathfinderPath.findMany({
        where,
        orderBy: [{ targetInvestorId: 'asc' }, { rank: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { page, limit, total, items };
  }

  /** All ranked paths for a single target (best first). Used by the drawer. */
  async getPathsForTarget(targetInvestorId: string) {
    const items = await this.prisma.pathfinderPath.findMany({
      where: { targetInvestorId },
      orderBy: { rank: 'asc' },
    });
    return { targetInvestorId, total: items.length, items };
  }

  /** The fuzzy-match human-confirm queue. */
  async listCrosswalkReview(query: CrosswalkReviewQueryDto) {
    const page = parsePage(query.page);
    const limit = parseLimit(query.limit);

    const where: Prisma.PathfinderEntityCrosswalkWhereInput = { needsReview: true };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.pathfinderEntityCrosswalk.count({ where }),
      this.prisma.pathfinderEntityCrosswalk.findMany({
        where,
        orderBy: { matchConfidence: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { page, limit, total, items };
  }
}

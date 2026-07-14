import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ConnectorMatchesDto, CrosswalkReviewQueryDto, ListPathfinderPathsQueryDto } from './dto/pathfinder.query.dto';
import { connectorMatchClause } from './connector-match.util';
import { collectMemberUidsNeedingImages, hydrateHopChainImages } from './hydrate-hopchain-images.util';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_CONNECTOR_MATCH_IDS = 500;
const MAX_CONNECTOR_LABELS = 20;
const MIN_CONNECTOR_CONTAINS_LENGTH = 3;

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

  /** All ranked paths for a single target (best first), each carrying its pending
   *  (not yet recomputed) corrections so the UI can show what was already
   *  submitted. Used by the drawer. */
  async getPathsForTarget(targetInvestorId: string) {
    const [paths, pendingCorrections] = await this.prisma.$transaction([
      this.prisma.pathfinderPath.findMany({
        where: { targetInvestorId },
        orderBy: { rank: 'asc' },
      }),
      this.prisma.pathfinderCorrection.findMany({
        where: { subjectType: 'path', targetInvestorId, appliedAt: null },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          subjectId: true,
          field: true,
          oldValue: true,
          newValue: true,
          note: true,
          actorEmail: true,
          createdAt: true,
        },
      }),
    ]);

    const correctionsByPathId = new Map<string, typeof pendingCorrections>();
    for (const c of pendingCorrections) {
      const list = correctionsByPathId.get(c.subjectId) ?? [];
      list.push(c);
      correctionsByPathId.set(c.subjectId, list);
    }

    const uidsNeedingImages = collectMemberUidsNeedingImages(paths.map((p) => p.hopChain));
    const imagesByUid = new Map<string, string>();
    if (uidsNeedingImages.length > 0) {
      const members = await this.prisma.member.findMany({
        where: { uid: { in: uidsNeedingImages } },
        select: { uid: true, image: { select: { url: true } } },
      });
      for (const m of members) {
        if (m.image?.url) imagesByUid.set(m.uid, m.image.url);
      }
    }

    const items = paths.map((p) => ({
      ...p,
      hopChain: hydrateHopChainImages(p.hopChain, imagesByUid),
      corrections: correctionsByPathId.get(String(p.id)) ?? [],
    }));
    return { targetInvestorId, total: items.length, items };
  }

  /** Batch connector lens: of the given targets, which have a path whose hop
   *  chain routes through any of the given connector node labels. One query for
   *  the whole visible page — replaces the per-row paths fan-out that 429'd. */
  async connectorMatches(dto: ConnectorMatchesDto) {
    const ids = (dto.target_investor_ids ?? []).filter((id) => typeof id === 'string' && id.trim() !== '');
    const labels = (dto.connector_labels ?? [])
      .filter((l) => typeof l === 'string')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l !== '');
    const containsLabels = (dto.connector_labels_contains ?? [])
      .filter((l) => typeof l === 'string')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l.length >= MIN_CONNECTOR_CONTAINS_LENGTH);

    if (ids.length === 0 || (labels.length === 0 && containsLabels.length === 0)) {
      return { matchedIds: [] };
    }
    if (ids.length > MAX_CONNECTOR_MATCH_IDS) {
      throw new BadRequestException(`target_investor_ids must contain at most ${MAX_CONNECTOR_MATCH_IDS} ids`);
    }
    if (labels.length > MAX_CONNECTOR_LABELS) {
      throw new BadRequestException(`connector_labels must contain at most ${MAX_CONNECTOR_LABELS} labels`);
    }
    if (containsLabels.length > MAX_CONNECTOR_LABELS) {
      throw new BadRequestException(`connector_labels_contains must contain at most ${MAX_CONNECTOR_LABELS} labels`);
    }

    // Match against hop-chain node labels OR the PL-team connector name — see
    // connectorMatchClause (single-sourced so this per-page batch and the
    // full-list members filter agree on what "connected" means).
    const rows = await this.prisma.$queryRaw<{ targetInvestorId: string }[]>`
      SELECT DISTINCT p."targetInvestorId"
      FROM "PathfinderPath" p
      WHERE p."targetInvestorId" IN (${Prisma.join(ids)})
        AND ${connectorMatchClause(labels, containsLabels)}`;

    return { matchedIds: rows.map((r) => r.targetInvestorId) };
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

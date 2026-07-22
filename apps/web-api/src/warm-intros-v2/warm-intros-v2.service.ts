import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import {
  ConnectionEdgeInput,
  GetWarmPathsByInvestorQueryDto,
  IngestConnectionEdgesDto,
  IngestWarmIntrosV2Response,
  IngestWarmPathsV2Dto,
  ListConnectionEdgesQueryDto,
  ListWarmIntrosV2FacetsQueryDto,
  ListWarmPathsV2QueryDto,
  WarmPathV2Input,
} from './dto/ingest-warm-intros-v2.dto';
import {
  buildPathSummary,
  enrichHopChainNames,
  matchesSearch,
  matchesSector,
  MasterProfileEnrichRow,
  parseInvestorSectors,
  toConnectorSummary,
  toInvestorSummary,
} from './warm-intros-v2-enrich.util';
import { computeWarmPathProximity } from './warm-intros-v2-proximity.util';

type WarmPathRow = {
  uid: string;
  targetProfileUid: string;
  targetSet: string;
  rank: number;
  score: number;
  hopCount: number;
  hopChain: unknown;
  bestConnectorProfileUid: string | null;
  alternateConnectorProfileUids: unknown;
  runId: string | null;
  computedAt: Date;
};

/**
 * ConnectionEdge + WarmPathV2 write + read. Ingest upserts by unique keys; no pairing logic.
 *
 * Edge upsert: (fromProfileUid, toProfileUid, relationKind)
 * Path upsert: (targetProfileUid, targetSet, rank) — pure upsert, no deletes.
 *
 * Read APIs denormalize MasterProfile + compute proximityCode/caliber/scorePercent for FE.
 */
@Injectable()
export class WarmIntrosV2Service {
  private readonly logger = new Logger(WarmIntrosV2Service.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingestEdges(dto: IngestConnectionEdgesDto): Promise<IngestWarmIntrosV2Response> {
    if (!Array.isArray(dto.edges)) {
      throw new BadRequestException('edges array is required');
    }

    const errors: string[] = [];
    dto.edges.forEach((e, i) => {
      if (!e.fromProfileUid || typeof e.fromProfileUid !== 'string' || e.fromProfileUid.trim() === '') {
        errors.push(`edges[${i}]: fromProfileUid is required`);
      }
      if (!e.toProfileUid || typeof e.toProfileUid !== 'string' || e.toProfileUid.trim() === '') {
        errors.push(`edges[${i}]: toProfileUid is required`);
      }
      if (!e.relationKind || typeof e.relationKind !== 'string' || e.relationKind.trim() === '') {
        errors.push(`edges[${i}]: relationKind is required`);
      }
      if (!this.isFiniteNumber(e.score)) {
        errors.push(`edges[${i}]: score must be a finite number`);
      }
      if (!this.isFiniteNumber(e.confidence)) {
        errors.push(`edges[${i}]: confidence must be a finite number`);
      }
      if (!e.method || typeof e.method !== 'string' || e.method.trim() === '') {
        errors.push(`edges[${i}]: method is required`);
      }
      if (e.reasons === undefined || e.reasons === null || !Array.isArray(e.reasons)) {
        errors.push(`edges[${i}]: reasons must be an array`);
      }
    });
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'invalid edges', errors });
    }

    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const edge of dto.edges) {
        const fromProfileUid = edge.fromProfileUid.trim();
        const toProfileUid = edge.toProfileUid.trim();
        const relationKind = edge.relationKind.trim();
        const data = this.toEdgeUpsertData(edge, dto.runId);
        const existing = await tx.connectionEdge.findUnique({
          where: {
            fromProfileUid_toProfileUid_relationKind: {
              fromProfileUid,
              toProfileUid,
              relationKind,
            },
          },
          select: { uid: true },
        });
        if (existing) {
          await tx.connectionEdge.update({
            where: {
              fromProfileUid_toProfileUid_relationKind: {
                fromProfileUid,
                toProfileUid,
                relationKind,
              },
            },
            data,
          });
          updated += 1;
        } else {
          await tx.connectionEdge.create({
            data: { fromProfileUid, toProfileUid, relationKind, ...data },
          });
          created += 1;
        }
      }
    });

    const upserted = created + updated;
    this.logger.log(
      `warm-intros-v2 edge ingest: received=${dto.edges.length} created=${created} ` +
        `updated=${updated} runId=${dto.runId ?? 'none'}`
    );

    return {
      runId: dto.runId,
      received: dto.edges.length,
      upserted,
      created,
      updated,
    };
  }

  async ingestPaths(dto: IngestWarmPathsV2Dto): Promise<IngestWarmIntrosV2Response> {
    if (!Array.isArray(dto.paths)) {
      throw new BadRequestException('paths array is required');
    }

    const errors: string[] = [];
    dto.paths.forEach((p, i) => {
      if (!p.targetProfileUid || typeof p.targetProfileUid !== 'string' || p.targetProfileUid.trim() === '') {
        errors.push(`paths[${i}]: targetProfileUid is required`);
      }
      if (!p.targetSet || typeof p.targetSet !== 'string' || p.targetSet.trim() === '') {
        errors.push(`paths[${i}]: targetSet is required`);
      }
      if (!this.isFiniteNumber(p.rank) || !Number.isInteger(p.rank)) {
        errors.push(`paths[${i}]: rank must be an integer`);
      }
      if (!this.isFiniteNumber(p.score)) {
        errors.push(`paths[${i}]: score must be a finite number`);
      }
      if (!this.isFiniteNumber(p.hopCount) || !Number.isInteger(p.hopCount)) {
        errors.push(`paths[${i}]: hopCount must be an integer`);
      }
      if (p.hopChain === undefined || p.hopChain === null) {
        errors.push(`paths[${i}]: hopChain is required`);
      }
    });
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'invalid paths', errors });
    }

    let created = 0;
    let updated = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const path of dto.paths) {
        const targetProfileUid = path.targetProfileUid.trim();
        const targetSet = path.targetSet.trim();
        const rank = path.rank;
        const data = this.toPathUpsertData(path, dto.runId);
        const existing = await tx.warmPathV2.findUnique({
          where: {
            targetProfileUid_targetSet_rank: {
              targetProfileUid,
              targetSet,
              rank,
            },
          },
          select: { uid: true },
        });
        if (existing) {
          await tx.warmPathV2.update({
            where: {
              targetProfileUid_targetSet_rank: {
                targetProfileUid,
                targetSet,
                rank,
              },
            },
            data,
          });
          updated += 1;
        } else {
          await tx.warmPathV2.create({
            data: { targetProfileUid, targetSet, rank, ...data },
          });
          created += 1;
        }
      }
    });

    const upserted = created + updated;
    this.logger.log(
      `warm-intros-v2 path ingest: received=${dto.paths.length} created=${created} ` +
        `updated=${updated} runId=${dto.runId ?? 'none'}`
    );

    return {
      runId: dto.runId,
      received: dto.paths.length,
      upserted,
      created,
      updated,
    };
  }

  async listPaths(query: ListWarmPathsV2QueryDto) {
    const targetSet = query.targetSet?.trim() || null;
    const connectorProfileUid = query.connectorProfileUid?.trim() || null;
    const minScoreRaw = query.minScore?.trim();
    const minScore = minScoreRaw !== undefined && minScoreRaw !== '' ? Number(minScoreRaw) : null;
    if (minScore !== null && !Number.isFinite(minScore)) {
      throw new BadRequestException('minScore must be a finite number');
    }

    const rankRaw = query.rank?.trim();
    const rank = rankRaw === undefined || rankRaw === '' ? 1 : Number.parseInt(rankRaw, 10);
    if (!Number.isFinite(rank) || !Number.isInteger(rank)) {
      throw new BadRequestException('rank must be an integer');
    }

    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0);
    const search = (query.search ?? query.q)?.trim() || null;
    const sector = query.sector?.trim() || null;
    const needsPostFilter = Boolean(search || sector);

    const where: Prisma.WarmPathV2WhereInput = { rank };
    if (targetSet) where.targetSet = targetSet;
    if (minScore !== null) where.score = { gte: minScore };
    if (connectorProfileUid) {
      where.OR = [
        { bestConnectorProfileUid: connectorProfileUid },
        { alternateConnectorProfileUids: { array_contains: connectorProfileUid } },
      ];
    }

    // Search/sector need MasterProfile join — load candidates then filter (v2 scale ~1–2k).
    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      ...(needsPostFilter ? {} : { take: limit, skip: offset }),
      orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
    })) as WarmPathRow[];

    const profilesByUid = await this.loadProfilesForPaths(paths);
    let enriched = paths.map((p) => this.enrichPath(p, profilesByUid, false));

    if (search) {
      enriched = enriched.filter((row) => matchesSearch(row.investor, search));
    }
    if (sector) {
      enriched = enriched.filter((row) => matchesSector(row.investor, sector));
    }

    const total = needsPostFilter ? enriched.length : await this.prisma.warmPathV2.count({ where });

    const page = needsPostFilter ? enriched.slice(offset, offset + limit) : enriched;

    return { paths: page, total };
  }

  async getPathsByInvestor(investorProfileUid: string, query: GetWarmPathsByInvestorQueryDto) {
    const uid = investorProfileUid?.trim();
    if (!uid) {
      throw new BadRequestException('investorProfileUid is required');
    }
    const targetSet = query.targetSet?.trim() || null;
    const where: Prisma.WarmPathV2WhereInput = { targetProfileUid: uid };
    if (targetSet) where.targetSet = targetSet;

    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
    })) as WarmPathRow[];

    const profilesByUid = await this.loadProfilesForPaths(paths);
    const enriched = paths.map((p) => this.enrichPath(p, profilesByUid, true));

    return {
      paths: enriched,
      investor: toInvestorSummary(uid, profilesByUid.get(uid)),
    };
  }

  /**
   * Facets for FE filters: distinct best connectors + investor sectors for rank=1 paths.
   */
  async listFacets(query: ListWarmIntrosV2FacetsQueryDto) {
    const targetSet = query.targetSet?.trim() || null;
    const where: Prisma.WarmPathV2WhereInput = { rank: 1 };
    if (targetSet) where.targetSet = targetSet;

    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      select: {
        targetProfileUid: true,
        bestConnectorProfileUid: true,
      },
    })) as Array<{ targetProfileUid: string; bestConnectorProfileUid: string | null }>;

    const uids = new Set<string>();
    for (const p of paths) {
      uids.add(p.targetProfileUid);
      if (p.bestConnectorProfileUid) uids.add(p.bestConnectorProfileUid);
    }
    const profilesByUid = await this.loadProfilesByUids([...uids]);

    const connectorCounts = new Map<string, number>();
    for (const p of paths) {
      const cid = p.bestConnectorProfileUid;
      if (!cid) continue;
      connectorCounts.set(cid, (connectorCounts.get(cid) ?? 0) + 1);
    }

    const connectors = [...connectorCounts.entries()]
      .map(([profileUid, pathCount]) => {
        const profile = profilesByUid.get(profileUid);
        return {
          profileUid,
          name: profile?.canonicalName || profileUid,
          pathCount,
        };
      })
      .sort((a, b) => b.pathCount - a.pathCount || a.name.localeCompare(b.name));

    const sectorCounts = new Map<string, { value: string; count: number }>();
    for (const p of paths) {
      const investor = profilesByUid.get(p.targetProfileUid);
      const sectors = parseInvestorSectors(investor?.investorMeta);
      const seen = new Set<string>();
      for (const s of sectors) {
        const key = s.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const existing = sectorCounts.get(key);
        if (existing) existing.count += 1;
        else sectorCounts.set(key, { value: s, count: 1 });
      }
    }

    const sectors = [...sectorCounts.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

    return { connectors, sectors };
  }

  async listEdges(query: ListConnectionEdgesQueryDto) {
    const fromProfileUid = query.fromProfileUid?.trim() || null;
    const toProfileUid = query.toProfileUid?.trim() || null;
    const relationKind = query.relationKind?.trim() || null;
    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200);

    const where: Prisma.ConnectionEdgeWhereInput = {};
    if (fromProfileUid) where.fromProfileUid = fromProfileUid;
    if (toProfileUid) where.toProfileUid = toProfileUid;
    if (relationKind) where.relationKind = relationKind;

    const edges = await this.prisma.connectionEdge.findMany({
      where,
      take: limit,
      orderBy: { updatedAt: 'desc' },
    });
    return { edges };
  }

  private enrichPath(path: WarmPathRow, profilesByUid: Map<string, MasterProfileEnrichRow>, enrichHopNames: boolean) {
    const proximity = computeWarmPathProximity({
      score: path.score,
      hopCount: path.hopCount,
      hopChain: path.hopChain,
    });

    const hopChain = enrichHopNames ? enrichHopChainNames(path.hopChain, profilesByUid) : path.hopChain;

    return {
      uid: path.uid,
      targetProfileUid: path.targetProfileUid,
      targetSet: path.targetSet,
      rank: path.rank,
      score: path.score,
      hopCount: path.hopCount,
      hopChain,
      bestConnectorProfileUid: path.bestConnectorProfileUid,
      alternateConnectorProfileUids: path.alternateConnectorProfileUids,
      runId: path.runId,
      computedAt: path.computedAt,
      proximityCode: proximity.proximityCode,
      caliber: proximity.caliber,
      scorePercent: proximity.scorePercent,
      scoreBand: proximity.scoreBand,
      investor: toInvestorSummary(path.targetProfileUid, profilesByUid.get(path.targetProfileUid)),
      bestConnector: toConnectorSummary(
        path.bestConnectorProfileUid,
        path.bestConnectorProfileUid ? profilesByUid.get(path.bestConnectorProfileUid) : undefined
      ),
      pathSummary: buildPathSummary(path.hopChain, path.alternateConnectorProfileUids),
    };
  }

  private async loadProfilesForPaths(paths: WarmPathRow[]): Promise<Map<string, MasterProfileEnrichRow>> {
    const uids = new Set<string>();
    for (const p of paths) {
      uids.add(p.targetProfileUid);
      if (p.bestConnectorProfileUid) uids.add(p.bestConnectorProfileUid);
      // hopChain hop uids (optional enrich)
      const chain = p.hopChain;
      if (chain && typeof chain === 'object' && !Array.isArray(chain)) {
        const hops = (chain as Record<string, unknown>).hops;
        if (Array.isArray(hops)) {
          for (const hop of hops) {
            if (hop && typeof hop === 'object' && typeof (hop as Record<string, unknown>).profileUid === 'string') {
              uids.add(String((hop as Record<string, unknown>).profileUid));
            }
          }
        }
      }
    }
    return this.loadProfilesByUids([...uids]);
  }

  private async loadProfilesByUids(uids: string[]): Promise<Map<string, MasterProfileEnrichRow>> {
    const map = new Map<string, MasterProfileEnrichRow>();
    if (uids.length === 0) return map;

    const rows = await this.prisma.masterProfile.findMany({
      where: { uid: { in: uids } },
      select: {
        uid: true,
        personKey: true,
        canonicalName: true,
        emails: true,
        currentOrg: true,
        currentTitle: true,
        investorMeta: true,
        affinityPersonId: true,
        memberUid: true,
      },
    });

    for (const row of rows) {
      map.set(row.uid, row as MasterProfileEnrichRow);
    }
    return map;
  }

  private toEdgeUpsertData(
    edge: ConnectionEdgeInput,
    batchRunId?: string
  ): Omit<Prisma.ConnectionEdgeCreateInput, 'fromProfileUid' | 'toProfileUid' | 'relationKind'> {
    const runId =
      edge.runId !== undefined && edge.runId !== null && String(edge.runId).trim() !== ''
        ? String(edge.runId).trim()
        : batchRunId?.trim() || null;

    return {
      score: edge.score,
      confidence: edge.confidence,
      method: edge.method.trim(),
      reasons: edge.reasons as Prisma.InputJsonValue,
      hintsUsed: this.jsonOrNull(edge.hintsUsed),
      provider: edge.provider ?? null,
      model: edge.model ?? null,
      promptVersion: edge.promptVersion ?? null,
      contentHash: edge.contentHash ?? null,
      runId,
    };
  }

  private toPathUpsertData(
    path: WarmPathV2Input,
    batchRunId?: string
  ): Omit<Prisma.WarmPathV2CreateInput, 'targetProfileUid' | 'targetSet' | 'rank'> {
    const runId =
      path.runId !== undefined && path.runId !== null && String(path.runId).trim() !== ''
        ? String(path.runId).trim()
        : batchRunId?.trim() || null;

    return {
      score: path.score,
      hopCount: path.hopCount,
      hopChain: path.hopChain as Prisma.InputJsonValue,
      bestConnectorProfileUid: path.bestConnectorProfileUid ?? null,
      alternateConnectorProfileUids: this.jsonOrNull(path.alternateConnectorProfileUids),
      runId,
      computedAt: this.parseComputedAt(path.computedAt),
    };
  }

  private jsonOrNull(value: unknown): Prisma.InputJsonValue | typeof Prisma.DbNull {
    if (value === undefined || value === null) return Prisma.DbNull;
    return value as Prisma.InputJsonValue;
  }

  private parseComputedAt(value: string | null | undefined): Date {
    if (value === null || value === undefined || value.trim() === '') return new Date();
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`invalid computedAt: ${value}`);
    }
    return d;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}

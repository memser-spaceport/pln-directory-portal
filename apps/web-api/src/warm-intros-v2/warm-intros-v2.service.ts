import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  ClearWarmPathReferDto,
  FeedbackActor,
  ListWarmPathFeedbackQueryDto,
  MyWarmPathFeedback,
  UpsertWarmPathFeedbackDto,
  WarmPathCanRefer,
  WarmPathFeedbackSummary,
} from './dto/warm-path-feedback.dto';
import {
  alternateUidsFromHopChain,
  buildPathSummary,
  enrichHopChainNames,
  matchesSearch,
  matchesSector,
  MasterProfileEnrichRow,
  parseInvestorSectors,
  toConnectorSummary,
  toInvestorSummary,
} from './warm-intros-v2-enrich.util';
import { computeWarmPathProximity, WARM_INTROS_V2_MIN_SCORE } from './warm-intros-v2-proximity.util';

const FEEDBACK_NOTE_MAX = 600;
const FEEDBACK_SUMMARY_RECENT_CAP = 5;

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

/** Keep first row per investor. Caller must pass score-desc ordered rows. */
function collapsePathsByInvestor<T extends { targetProfileUid: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    if (seen.has(row.targetProfileUid)) continue;
    seen.add(row.targetProfileUid);
    out.push(row);
  }
  return out;
}

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
    const minScore = minScoreRaw !== undefined && minScoreRaw !== '' ? Number(minScoreRaw) : WARM_INTROS_V2_MIN_SCORE;
    if (!Number.isFinite(minScore)) {
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
    // "All" returns one path per (investor, list); collapse to one row per investor.
    const collapseByInvestor = !targetSet;
    const loadThenPaginate = needsPostFilter || collapseByInvestor;

    const where: Prisma.WarmPathV2WhereInput = { rank, score: { gte: minScore } };
    if (targetSet) where.targetSet = targetSet;
    if (connectorProfileUid) {
      where.OR = [
        { bestConnectorProfileUid: connectorProfileUid },
        { alternateConnectorProfileUids: { array_contains: connectorProfileUid } },
      ];
    }

    // Search/sector/All collapse need full candidate set then slice (v2 scale ~1–2k).
    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      ...(loadThenPaginate ? {} : { take: limit, skip: offset }),
      orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
    })) as WarmPathRow[];

    const profilesByUid = await this.loadProfilesForPaths(paths);
    let enriched = paths
      .map((p) => this.enrichPath(p, profilesByUid, false))
      .filter((row) => row.bestConnectorProfileUid !== row.targetProfileUid);

    if (search) {
      enriched = enriched.filter((row) => matchesSearch(row.investor, search));
    }
    if (sector) {
      enriched = enriched.filter((row) => matchesSector(row.investor, sector));
    }
    if (collapseByInvestor) {
      enriched = collapsePathsByInvestor(enriched);
    }

    const total = loadThenPaginate ? enriched.length : await this.prisma.warmPathV2.count({ where });

    const page = loadThenPaginate ? enriched.slice(offset, offset + limit) : enriched;

    return { paths: page, total };
  }

  async getPathsByInvestor(
    investorProfileUid: string,
    query: GetWarmPathsByInvestorQueryDto,
    opts: { actor?: FeedbackActor | null; includeFeedbackSummary?: boolean } = {}
  ) {
    const uid = investorProfileUid?.trim();
    if (!uid) {
      throw new BadRequestException('investorProfileUid is required');
    }
    const targetSet = query.targetSet?.trim() || null;
    const where: Prisma.WarmPathV2WhereInput = {
      targetProfileUid: uid,
      score: { gte: WARM_INTROS_V2_MIN_SCORE },
    };
    if (targetSet) where.targetSet = targetSet;

    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
    })) as WarmPathRow[];

    const profilesByUid = await this.loadProfilesForPaths(paths);
    const enriched = paths
      .map((p) => this.enrichPath(p, profilesByUid, true))
      .filter((row) => row.bestConnectorProfileUid !== row.targetProfileUid);

    const withFeedback = await this.attachPathFeedback(enriched, opts.actor ?? null, !!opts.includeFeedbackSummary);

    return {
      paths: withFeedback,
      investor: toInvestorSummary(uid, profilesByUid.get(uid)),
    };
  }

  async upsertPathFeedback(warmPathUid: string, dto: UpsertWarmPathFeedbackDto, actor: FeedbackActor) {
    const pathUid = warmPathUid?.trim();
    if (!pathUid) throw new BadRequestException('warmPathUid is required');

    const connectorProfileUid = dto.connectorProfileUid?.trim();
    if (!connectorProfileUid) throw new BadRequestException('connectorProfileUid is required');

    const actorUid = actor.uid?.trim() || null;
    if (!actorUid) throw new BadRequestException('actor identity is required');

    const hasCanRefer = Object.prototype.hasOwnProperty.call(dto, 'canRefer');
    const hasNote = Object.prototype.hasOwnProperty.call(dto, 'note');
    if (!hasCanRefer && !hasNote) {
      throw new BadRequestException('at least one of canRefer or note is required');
    }

    let canRefer: WarmPathCanRefer | null | undefined;
    if (hasCanRefer) {
      if (dto.canRefer === null || dto.canRefer === undefined) {
        canRefer = null;
      } else if (dto.canRefer === 'yes' || dto.canRefer === 'no') {
        canRefer = dto.canRefer;
      } else {
        throw new BadRequestException(`canRefer must be 'yes', 'no', or null`);
      }
    }

    let note: string | null | undefined;
    if (hasNote) {
      if (dto.note === null || dto.note === undefined) {
        note = null;
      } else if (typeof dto.note !== 'string') {
        throw new BadRequestException('note must be a string or null');
      } else {
        const trimmed = dto.note.trim();
        if (trimmed.length > FEEDBACK_NOTE_MAX) {
          throw new BadRequestException(`note must be <= ${FEEDBACK_NOTE_MAX} characters`);
        }
        note = trimmed.length === 0 ? null : trimmed;
      }
    }

    const path = await this.prisma.warmPathV2.findUnique({
      where: { uid: pathUid },
      select: {
        uid: true,
        targetProfileUid: true,
        targetSet: true,
        bestConnectorProfileUid: true,
        alternateConnectorProfileUids: true,
        hopChain: true,
      },
    });
    if (!path) throw new NotFoundException(`WarmPathV2 not found: ${pathUid}`);
    this.assertConnectorOnPath(path, connectorProfileUid);

    const existing = await this.prisma.warmPathV2Feedback.findUnique({
      where: {
        warmPathUid_connectorProfileUid_actorUid: {
          warmPathUid: pathUid,
          connectorProfileUid,
          actorUid,
        },
      },
    });

    const nextCanRefer = hasCanRefer ? (canRefer as WarmPathCanRefer | null) : existing?.canRefer ?? null;
    const nextNote = hasNote ? (note as string | null) : existing?.note ?? null;

    if (nextCanRefer == null && (nextNote == null || nextNote === '')) {
      if (existing) {
        await this.prisma.warmPathV2Feedback.delete({ where: { uid: existing.uid } });
        return { deleted: true as const };
      }
      return { deleted: true as const };
    }

    const data = {
      targetProfileUid: path.targetProfileUid,
      targetSet: path.targetSet,
      canRefer: nextCanRefer,
      note: nextNote,
      actorEmail: actor.email?.trim() || null,
    };

    if (existing) {
      const row = await this.prisma.warmPathV2Feedback.update({
        where: { uid: existing.uid },
        data,
      });
      return this.toFeedbackDto(row);
    }

    const row = await this.prisma.warmPathV2Feedback.create({
      data: {
        warmPathUid: pathUid,
        connectorProfileUid,
        actorUid,
        ...data,
      },
    });
    return this.toFeedbackDto(row);
  }

  async clearPathRefer(warmPathUid: string, dto: ClearWarmPathReferDto, actor: FeedbackActor) {
    return this.upsertPathFeedback(
      warmPathUid,
      { connectorProfileUid: dto.connectorProfileUid, canRefer: null },
      actor
    );
  }

  async listPathFeedback(query: ListWarmPathFeedbackQueryDto) {
    const limit = Math.min(Math.max(parseInt(query.limit ?? '50', 10) || 50, 1), 200);
    const offset = Math.max(parseInt(query.offset ?? '0', 10) || 0, 0);
    const targetProfileUid = query.targetProfileUid?.trim() || null;
    const q = query.q?.trim() || null;

    const where: Prisma.WarmPathV2FeedbackWhereInput = {};
    if (targetProfileUid) where.targetProfileUid = targetProfileUid;
    if (q) {
      where.OR = [{ actorEmail: { contains: q, mode: 'insensitive' } }, { note: { contains: q, mode: 'insensitive' } }];
    }

    const [total, rows] = await Promise.all([
      this.prisma.warmPathV2Feedback.count({ where }),
      this.prisma.warmPathV2Feedback.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
    ]);

    const pathUids = [...new Set(rows.map((r) => r.warmPathUid))];
    const connectorUids = [...new Set(rows.map((r) => r.connectorProfileUid))];
    const investorUids = [...new Set(rows.map((r) => r.targetProfileUid))];

    type PathLite = {
      uid: string;
      score: number;
      hopCount: number;
      hopChain: unknown;
      bestConnectorProfileUid: string | null;
    };

    const [paths, profilesByUid] = await Promise.all([
      pathUids.length
        ? (this.prisma.warmPathV2.findMany({
            where: { uid: { in: pathUids } },
            select: {
              uid: true,
              score: true,
              hopCount: true,
              hopChain: true,
              bestConnectorProfileUid: true,
            },
          }) as Promise<PathLite[]>)
        : Promise.resolve([] as PathLite[]),
      this.loadProfilesByUids([...new Set([...connectorUids, ...investorUids])]),
    ]);

    const pathByUid = new Map<string, PathLite>(paths.map((p) => [p.uid, p] as const));

    const items = rows.map((r) => {
      const path = pathByUid.get(r.warmPathUid);
      const proximity = path
        ? computeWarmPathProximity({
            score: path.score,
            hopCount: path.hopCount,
            hopChain: path.hopChain,
          })
        : null;
      return {
        uid: r.uid,
        warmPathUid: r.warmPathUid,
        targetProfileUid: r.targetProfileUid,
        targetSet: r.targetSet,
        connectorProfileUid: r.connectorProfileUid,
        canRefer: (r.canRefer as WarmPathCanRefer | null) ?? null,
        note: r.note,
        actorUid: r.actorUid,
        actorEmail: r.actorEmail,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        investor: toInvestorSummary(r.targetProfileUid, profilesByUid.get(r.targetProfileUid)),
        connector: toConnectorSummary(r.connectorProfileUid, profilesByUid.get(r.connectorProfileUid)),
        proximityCode: proximity?.proximityCode ?? null,
        scorePercent: proximity?.scorePercent ?? null,
        scoreBand: proximity?.scoreBand ?? null,
        isBestConnector: path?.bestConnectorProfileUid === r.connectorProfileUid,
      };
    });

    return { items, total, limit, offset };
  }

  /**
   * Facets for FE filters:
   * - connectors: ALL MasterProfiles with type `pl_internal` (so the PL member
   *   dropdown always lists the full roster, not only people who are currently
   *   someone’s best connector), with pathCount = how often they are best on rank=1.
   * - sectors: aggregated from investors on rank=1 paths.
   */
  async listFacets(query: ListWarmIntrosV2FacetsQueryDto) {
    const targetSet = query.targetSet?.trim() || null;
    const where: Prisma.WarmPathV2WhereInput = { rank: 1, score: { gte: WARM_INTROS_V2_MIN_SCORE } };
    if (targetSet) where.targetSet = targetSet;

    const paths = (await this.prisma.warmPathV2.findMany({
      where,
      select: {
        targetProfileUid: true,
        bestConnectorProfileUid: true,
      },
    })) as Array<{ targetProfileUid: string; bestConnectorProfileUid: string | null }>;

    const connectorCounts = new Map<string, number>();
    for (const p of paths) {
      const cid = p.bestConnectorProfileUid;
      if (!cid) continue;
      connectorCounts.set(cid, (connectorCounts.get(cid) ?? 0) + 1);
    }

    const plConnectors = await this.prisma.masterProfile.findMany({
      where: { types: { has: 'pl_internal' } },
      select: { uid: true, canonicalName: true },
      orderBy: { canonicalName: 'asc' },
    });

    const connectors = plConnectors
      .map((c) => ({
        profileUid: c.uid,
        name: c.canonicalName || c.uid,
        pathCount: connectorCounts.get(c.uid) ?? 0,
      }))
      .sort((a, b) => b.pathCount - a.pathCount || a.name.localeCompare(b.name));

    const investorUids = [...new Set(paths.map((p) => p.targetProfileUid))];
    const profilesByUid = await this.loadProfilesByUids(investorUids);

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

  private async attachPathFeedback<
    T extends {
      uid: string;
      bestConnectorProfileUid: string | null;
      alternateConnectorProfileUids: unknown;
      hopChain: unknown;
    }
  >(
    paths: T[],
    actor: FeedbackActor | null,
    includeSummary: boolean
  ): Promise<
    Array<
      T & {
        myFeedbackByConnector?: Record<string, MyWarmPathFeedback>;
        feedbackSummaryByConnector?: Record<string, WarmPathFeedbackSummary>;
      }
    >
  > {
    if (paths.length === 0) return paths;

    const warmPathUids = paths.map((p) => p.uid);
    const actorUid = actor?.uid?.trim() || null;

    const [mine, allForSummary] = await Promise.all([
      actorUid
        ? this.prisma.warmPathV2Feedback.findMany({
            where: { warmPathUid: { in: warmPathUids }, actorUid },
          })
        : Promise.resolve([]),
      includeSummary
        ? this.prisma.warmPathV2Feedback.findMany({
            where: { warmPathUid: { in: warmPathUids } },
            orderBy: { updatedAt: 'desc' },
          })
        : Promise.resolve([]),
    ]);

    const mineByPath = new Map<string, typeof mine>();
    for (const row of mine) {
      const list = mineByPath.get(row.warmPathUid) ?? [];
      list.push(row);
      mineByPath.set(row.warmPathUid, list);
    }

    const summaryByPath = new Map<string, typeof allForSummary>();
    for (const row of allForSummary) {
      const list = summaryByPath.get(row.warmPathUid) ?? [];
      list.push(row);
      summaryByPath.set(row.warmPathUid, list);
    }

    return paths.map((path) => {
      const connectorUids = this.connectorUidsOnPath(path);
      const myFeedbackByConnector: Record<string, MyWarmPathFeedback> = {};
      for (const row of mineByPath.get(path.uid) ?? []) {
        if (!connectorUids.has(row.connectorProfileUid)) continue;
        myFeedbackByConnector[row.connectorProfileUid] = {
          canRefer: (row.canRefer as WarmPathCanRefer | null) ?? null,
          note: row.note,
          updatedAt: row.updatedAt.toISOString(),
        };
      }

      const out: T & {
        myFeedbackByConnector?: Record<string, MyWarmPathFeedback>;
        feedbackSummaryByConnector?: Record<string, WarmPathFeedbackSummary>;
      } = { ...path };

      if (Object.keys(myFeedbackByConnector).length > 0) {
        out.myFeedbackByConnector = myFeedbackByConnector;
      }

      if (includeSummary) {
        const feedbackSummaryByConnector: Record<string, WarmPathFeedbackSummary> = {};
        const rows = summaryByPath.get(path.uid) ?? [];
        for (const connectorUid of connectorUids) {
          const forConnector = rows.filter((r) => r.connectorProfileUid === connectorUid);
          if (forConnector.length === 0) continue;
          let yesCount = 0;
          let noCount = 0;
          let noteCount = 0;
          for (const r of forConnector) {
            if (r.canRefer === 'yes') yesCount += 1;
            else if (r.canRefer === 'no') noCount += 1;
            if (r.note && r.note.trim()) noteCount += 1;
          }
          feedbackSummaryByConnector[connectorUid] = {
            yesCount,
            noCount,
            noteCount,
            recent: forConnector.slice(0, FEEDBACK_SUMMARY_RECENT_CAP).map((r) => ({
              actorEmail: r.actorEmail,
              canRefer: (r.canRefer as WarmPathCanRefer | null) ?? null,
              note: r.note,
              updatedAt: r.updatedAt.toISOString(),
            })),
          };
        }
        if (Object.keys(feedbackSummaryByConnector).length > 0) {
          out.feedbackSummaryByConnector = feedbackSummaryByConnector;
        }
      }

      return out;
    });
  }

  private connectorUidsOnPath(path: {
    bestConnectorProfileUid: string | null;
    alternateConnectorProfileUids: unknown;
    hopChain: unknown;
  }): Set<string> {
    const uids = new Set<string>();
    if (path.bestConnectorProfileUid) uids.add(path.bestConnectorProfileUid);
    if (Array.isArray(path.alternateConnectorProfileUids)) {
      for (const uid of path.alternateConnectorProfileUids) {
        if (typeof uid === 'string' && uid.trim()) uids.add(uid.trim());
      }
    }
    for (const uid of alternateUidsFromHopChain(path.hopChain)) {
      if (uid) uids.add(uid);
    }
    return uids;
  }

  private assertConnectorOnPath(
    path: {
      bestConnectorProfileUid: string | null;
      alternateConnectorProfileUids: unknown;
      hopChain: unknown;
    },
    connectorProfileUid: string
  ) {
    if (!this.connectorUidsOnPath(path).has(connectorProfileUid)) {
      throw new BadRequestException(`connectorProfileUid is not on this path: ${connectorProfileUid}`);
    }
  }

  private toFeedbackDto(row: {
    uid: string;
    warmPathUid: string;
    targetProfileUid: string;
    targetSet: string;
    connectorProfileUid: string;
    canRefer: string | null;
    note: string | null;
    actorUid: string | null;
    actorEmail: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      uid: row.uid,
      warmPathUid: row.warmPathUid,
      targetProfileUid: row.targetProfileUid,
      targetSet: row.targetSet,
      connectorProfileUid: row.connectorProfileUid,
      canRefer: (row.canRefer as WarmPathCanRefer | null) ?? null,
      note: row.note,
      actorUid: row.actorUid,
      actorEmail: row.actorEmail,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private enrichPath(path: WarmPathRow, profilesByUid: Map<string, MasterProfileEnrichRow>, enrichHopNames: boolean) {
    const proximity = computeWarmPathProximity({
      score: path.score,
      hopCount: path.hopCount,
      hopChain: path.hopChain,
    });

    const hopChain = enrichHopNames ? enrichHopChainNames(path.hopChain, profilesByUid, path.hopCount) : path.hopChain;
    const alternateConnectorProfileUids = enrichHopNames
      ? alternateUidsFromHopChain(hopChain)
      : path.alternateConnectorProfileUids;

    return {
      uid: path.uid,
      targetProfileUid: path.targetProfileUid,
      targetSet: path.targetSet,
      rank: path.rank,
      score: path.score,
      hopCount: path.hopCount,
      hopChain,
      bestConnectorProfileUid: path.bestConnectorProfileUid,
      alternateConnectorProfileUids,
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
      pathSummary: buildPathSummary(hopChain, alternateConnectorProfileUids),
    };
  }

  private async loadProfilesForPaths(paths: WarmPathRow[]): Promise<Map<string, MasterProfileEnrichRow>> {
    const uids = new Set<string>();
    for (const p of paths) {
      uids.add(p.targetProfileUid);
      if (p.bestConnectorProfileUid) uids.add(p.bestConnectorProfileUid);
      if (Array.isArray(p.alternateConnectorProfileUids)) {
        for (const uid of p.alternateConnectorProfileUids) {
          if (typeof uid === 'string' && uid.trim()) uids.add(uid.trim());
        }
      }
      const chain = p.hopChain;
      if (chain && typeof chain === 'object' && !Array.isArray(chain)) {
        const rec = chain as Record<string, unknown>;
        for (const key of ['hops', 'alternates'] as const) {
          const nodes = rec[key];
          if (!Array.isArray(nodes)) continue;
          for (const node of nodes) {
            if (node && typeof node === 'object' && typeof (node as Record<string, unknown>).profileUid === 'string') {
              uids.add(String((node as Record<string, unknown>).profileUid));
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
        listMemberships: true,
      },
    });

    for (const row of rows) {
      map.set(row.uid, { ...(row as MasterProfileEnrichRow), imageUrl: null });
    }

    await this.attachMemberImageUrls(map);
    return map;
  }

  /** Resolve Directory Member.image.url onto profiles that have memberUid. */
  private async attachMemberImageUrls(map: Map<string, MasterProfileEnrichRow>): Promise<void> {
    const memberUids = [
      ...new Set([...map.values()].map((p) => p.memberUid?.trim()).filter((uid): uid is string => !!uid)),
    ];
    if (memberUids.length === 0) return;

    const members = await this.prisma.member.findMany({
      where: { uid: { in: memberUids } },
      select: { uid: true, image: { select: { url: true } } },
    });
    const urlByMemberUid = new Map<string, string | null>();
    for (const m of members) {
      urlByMemberUid.set(m.uid, m.image?.url ?? null);
    }
    for (const profile of map.values()) {
      const memberUid = profile.memberUid?.trim();
      if (!memberUid) continue;
      profile.imageUrl = urlByMemberUid.get(memberUid) ?? null;
    }
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

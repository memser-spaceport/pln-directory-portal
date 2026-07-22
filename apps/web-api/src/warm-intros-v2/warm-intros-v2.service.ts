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
  ListWarmPathsV2QueryDto,
  WarmPathV2Input,
} from './dto/ingest-warm-intros-v2.dto';

/**
 * ConnectionEdge + WarmPathV2 write + read. Ingest upserts by unique keys; no pairing logic.
 *
 * Edge upsert: (fromProfileUid, toProfileUid, relationKind)
 * Path upsert: (targetProfileUid, targetSet, rank) — pure upsert, no deletes.
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

    const where: Prisma.WarmPathV2WhereInput = { rank };
    if (targetSet) where.targetSet = targetSet;
    if (minScore !== null) where.score = { gte: minScore };
    if (connectorProfileUid) {
      where.OR = [
        { bestConnectorProfileUid: connectorProfileUid },
        { alternateConnectorProfileUids: { array_contains: connectorProfileUid } },
      ];
    }

    const paths = await this.prisma.warmPathV2.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: [{ score: 'desc' }, { targetProfileUid: 'asc' }],
    });
    return { paths };
  }

  async getPathsByInvestor(investorProfileUid: string, query: GetWarmPathsByInvestorQueryDto) {
    const uid = investorProfileUid?.trim();
    if (!uid) {
      throw new BadRequestException('investorProfileUid is required');
    }
    const targetSet = query.targetSet?.trim() || null;
    const where: Prisma.WarmPathV2WhereInput = { targetProfileUid: uid };
    if (targetSet) where.targetSet = targetSet;

    const paths = await this.prisma.warmPathV2.findMany({
      where,
      orderBy: [{ targetSet: 'asc' }, { rank: 'asc' }],
    });
    return { paths };
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

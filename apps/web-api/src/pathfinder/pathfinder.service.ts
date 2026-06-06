import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { IngestPathfinderDto, IngestPathfinderResponse, PathfinderPathInput } from './dto/ingest-pathfinder.dto';
import { CreateCorrectionDto, ResolveCrosswalkDto } from './dto/correction.dto';

export interface CorrectionActor {
  uid?: string | null;
  email?: string | null;
}

/**
 * PL Path Finder write-side service: service-ingest of computed paths/crosswalk,
 * plus the human-in-the-loop corrections store. Mirrors InvestorOutreachService.
 */
@Injectable()
export class PathfinderService {
  private readonly logger = new Logger(PathfinderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async ingest(dto: IngestPathfinderDto): Promise<IngestPathfinderResponse> {
    if (!dto.targetSet || dto.targetSet.trim() === '') {
      throw new BadRequestException('targetSet is required');
    }
    if (!Array.isArray(dto.paths)) {
      throw new BadRequestException('paths array is required');
    }

    const errors: string[] = [];
    const byTarget = new Map<string, PathfinderPathInput[]>();
    for (const p of dto.paths) {
      if (
        !p.target_investor_id ||
        !p.proximity_code ||
        typeof p.score !== 'number' ||
        typeof p.hops !== 'number' ||
        !p.connector_type
      ) {
        errors.push(`path for "${p.target_investor_id ?? '?'}" is missing required fields`);
        continue;
      }
      const bucket = byTarget.get(p.target_investor_id) ?? [];
      bucket.push(p);
      byTarget.set(p.target_investor_id, bucket);
    }

    let pathsIngested = 0;
    let targetsReplaced = 0;
    let crosswalkUpserted = 0;
    let summariesApplied = 0;

    await this.prisma.$transaction(async (tx) => {
      // Replace-per-target: delete the target's existing paths in this set, then insert.
      for (const [targetInvestorId, paths] of byTarget) {
        await tx.pathfinderPath.deleteMany({
          where: { targetInvestorId, targetSet: dto.targetSet },
        });
        targetsReplaced += 1;
        await tx.pathfinderPath.createMany({
          data: paths.map((p) => ({
            targetInvestorId: p.target_investor_id,
            targetSet: dto.targetSet,
            connectorType: p.connector_type,
            hops: p.hops,
            caliber: p.caliber ?? null,
            proximityCode: p.proximity_code,
            score: p.score,
            caliberConfidence: p.caliber_confidence ?? null,
            hopChain: (p.hop_chain ?? {}) as Prisma.InputJsonValue,
            rank: p.rank ?? 0,
            ingestRunId: dto.runId ?? null,
          })),
        });
        pathsIngested += paths.length;
      }

      // Upsert crosswalk by canonicalId (updateMany-then-create — no unique
      // constraint needed; human resolutions feed the next recompute via corrections).
      for (const c of dto.crosswalk ?? []) {
        const data = {
          canonicalId: c.canonical_id,
          directoryUid: c.directory_uid ?? null,
          affinityId: c.affinity_id ?? null,
          investorId: c.investor_id ?? null,
          entityType: c.entity_type,
          displayName: c.display_name ?? null,
          firm: c.firm ?? null,
          matchMethod: c.match_method,
          matchConfidence: c.match_confidence,
          isConfirmed: c.is_confirmed ?? false,
          isFounderLpLink: c.is_founder_lp_link ?? false,
          needsReview: c.needs_review ?? false,
          ingestRunId: dto.runId ?? null,
        };
        const updated = await tx.pathfinderEntityCrosswalk.updateMany({
          where: { canonicalId: c.canonical_id },
          data,
        });
        if (updated.count === 0) {
          await tx.pathfinderEntityCrosswalk.create({ data });
        }
        crosswalkUpserted += 1;
      }

      // Denormalize the 2 additive summary fields onto InvestorOutreachRecord.
      for (const s of dto.summaries ?? []) {
        const res = await tx.investorOutreachRecord.updateMany({
          where: { investorId: s.investor_id },
          data: { bestProximityCode: s.best_proximity_code, hasPath: s.has_path },
        });
        if (res.count > 0) summariesApplied += 1;
      }
    });

    this.logger.log(
      `pathfinder ingest: targetSet=${dto.targetSet} paths=${pathsIngested} ` +
        `targetsReplaced=${targetsReplaced} crosswalk=${crosswalkUpserted} ` +
        `summaries=${summariesApplied} runId=${dto.runId ?? 'none'}`
    );

    return {
      received: dto.paths.length,
      paths_ingested: pathsIngested,
      targets_replaced: targetsReplaced,
      crosswalk_upserted: crosswalkUpserted,
      summaries_applied: summariesApplied,
      failed: errors.length,
      errors: errors.length ? errors : undefined,
    };
  }

  async createCorrection(dto: CreateCorrectionDto, actor: CorrectionActor) {
    if (!dto.subject_type || !dto.subject_id || !dto.field) {
      throw new BadRequestException('subject_type, subject_id and field are required');
    }
    return this.prisma.pathfinderCorrection.create({
      data: {
        subjectType: dto.subject_type,
        subjectId: dto.subject_id,
        field: dto.field,
        oldValue: dto.old_value === undefined ? undefined : (dto.old_value as Prisma.InputJsonValue),
        newValue: dto.new_value === undefined ? undefined : (dto.new_value as Prisma.InputJsonValue),
        note: dto.note ?? null,
        actorUid: actor.uid ?? null,
        actorEmail: actor.email ?? null,
      },
    });
  }

  async resolveCrosswalk(id: number, dto: ResolveCrosswalkDto, actor: CorrectionActor) {
    if (Number.isNaN(id)) {
      throw new BadRequestException('crosswalk id must be a number');
    }
    const row = await this.prisma.pathfinderEntityCrosswalk.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`crosswalk ${id} not found`);
    }
    const [updated] = await this.prisma.$transaction([
      this.prisma.pathfinderEntityCrosswalk.update({
        where: { id },
        data: { isConfirmed: dto.confirmed, needsReview: false },
      }),
      this.prisma.pathfinderCorrection.create({
        data: {
          subjectType: 'crosswalk',
          subjectId: String(id),
          field: 'match',
          oldValue: { isConfirmed: row.isConfirmed, needsReview: row.needsReview } as Prisma.InputJsonValue,
          newValue: { isConfirmed: dto.confirmed, needsReview: false } as Prisma.InputJsonValue,
          note: dto.note ?? null,
          actorUid: actor.uid ?? null,
          actorEmail: actor.email ?? null,
          appliedAt: new Date(),
        },
      }),
    ]);
    return updated;
  }
}

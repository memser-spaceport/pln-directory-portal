import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LogoVerificationResult } from './logo-verification.types';
import {
  FIELD_JUDGMENT_NOTE_MAX_LENGTH,
  FieldConfidence,
  FieldEnrichmentMeta,
  FieldEnrichmentStatus,
  JudgmentSource,
  JudgmentVerdict,
  TeamDataEnrichment,
} from './team-enrichment.types';

@Injectable()
export class LogoVerificationPersistenceService {
  private readonly logger = new Logger(LogoVerificationPersistenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getTeamsForVerification(params: {
    /**
     * Chunk size for one round-trip. `LogoVerificationJobService` loops
     * round-trips until eligibility is exhausted, so this no longer caps
     * the run's total throughput — it's purely a memory / query-size knob.
     * Omit for "all matching teams in one query" (used by per-uid trigger
     * fan-outs that need every candidate up front).
     */
    limit?: number;
    provider: string;
    model: string | null;
    force?: boolean;
    /**
     * Skip these uids. Required for two cases:
     *   - force=true (NOT EXISTS gate is disabled, so successful verifies
     *     don't naturally drop off — without exclusion the loop fetches the
     *     same top-N forever).
     *   - failures (no TLVR row inserted, so NOT EXISTS still matches).
     */
    excludeUids?: string[];
  }): Promise<Array<{
    uid: string;
    name: string;
    website: string | null;
    logoUid: string | null;
    logo: { uid: string; url: string } | null;
  }>> {
    // Important: do not select the newest N teams first and then skip already-verified
    // records in memory. That starves older teams forever once the newest page has
    // already been processed. Instead, select only teams that still need verification.
    const needsVerificationFilter = params.force
      ? Prisma.empty
      : Prisma.sql`
        AND NOT EXISTS (
          SELECT 1
          FROM "TeamLogoVerificationResult" tlvr
          WHERE tlvr."teamUid" = t."uid"
            AND tlvr."provider" = ${params.provider}
            AND tlvr."logoUid" = COALESCE(te."logoUid", t."logoUid")
            AND tlvr."model" IS NOT DISTINCT FROM ${params.model}
        )
      `;

    const excludeClause =
      params.excludeUids && params.excludeUids.length > 0
        ? Prisma.sql`AND t."uid" NOT IN (${Prisma.join(params.excludeUids)})`
        : Prisma.empty;

    const limitClause =
      typeof params.limit === 'number' && params.limit > 0
        ? Prisma.sql`LIMIT ${params.limit}`
        : Prisma.empty;

    const rows = await this.prisma.$queryRaw<Array<{
      uid: string;
      name: string;
      website: string | null;
      logoUid: string | null;
      logoUrl: string;
      logoImageUid: string;
    }>>(Prisma.sql`
      SELECT
        t."uid",
        t."name",
        t."website",
        COALESCE(te."logoUid", t."logoUid") AS "logoUid",
        i."uid" AS "logoImageUid",
        i."url" AS "logoUrl"
      FROM "Team" t
      INNER JOIN "TeamEnrichment" te ON te."teamUid" = t."uid"
      INNER JOIN "Image" i ON i."uid" = COALESCE(te."logoUid", t."logoUid")
      WHERE i."url" IS NOT NULL
        ${needsVerificationFilter}
        ${excludeClause}
      ORDER BY t."priority" ASC, t."updatedAt" DESC
      ${limitClause}
    `);

    return rows.map((row) => ({
      uid: row.uid,
      name: row.name,
      website: row.website,
      logoUid: row.logoUid,
      logo: {
        uid: row.logoImageUid,
        url: row.logoUrl,
      },
    }));
  }

  /**
   * Per-uid variant of `getTeamsForVerification`. Returns the team payload
   * needed for a verify call regardless of whether the team is currently
   * "pending" (no eligibility / NOT EXISTS filter applied — the caller
   * decides what to do via `shouldVerifyTeam`). Used by the per-uid admin
   * trigger endpoint where the admin has explicitly named the target.
   *
   * Still enforces the hard requirements that the VLM call needs: there
   * must be a `Team`, a logo to verify (`TeamEnrichment.logoUid`, else
   * `Team.logoUid`), an `Image.url`, and an associated `TeamEnrichment` row.
   * Returns null if any of those are missing.
   */
  async getTeamForVerificationByUid(uid: string): Promise<{
    uid: string;
    name: string;
    website: string | null;
    logoUid: string | null;
    logo: { uid: string; url: string } | null;
  } | null> {
    const rows = await this.prisma.$queryRaw<Array<{
      uid: string;
      name: string;
      website: string | null;
      logoUid: string | null;
      logoUrl: string;
      logoImageUid: string;
    }>>(Prisma.sql`
      SELECT
        t."uid",
        t."name",
        t."website",
        COALESCE(te."logoUid", t."logoUid") AS "logoUid",
        i."uid" AS "logoImageUid",
        i."url" AS "logoUrl"
      FROM "Team" t
      INNER JOIN "TeamEnrichment" te ON te."teamUid" = t."uid"
      INNER JOIN "Image" i ON i."uid" = COALESCE(te."logoUid", t."logoUid")
      WHERE t."uid" = ${uid}
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) return null;
    return {
      uid: row.uid,
      name: row.name,
      website: row.website,
      logoUid: row.logoUid,
      logo: { uid: row.logoImageUid, url: row.logoUrl },
    };
  }

  async shouldVerifyTeam(params: {
    teamUid: string;
    logoUid: string | null;
    provider: string;
    model: string | null;
    force?: boolean;
  }): Promise<boolean> {
    if (params.force) return true;
    if (!params.logoUid) return false;

    const latest = await this.prisma.teamLogoVerificationResult.findFirst({
      where: {
        teamUid: params.teamUid,
        provider: params.provider,
      },
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        logoUid: true,
        model: true,
      },
    });

    if (!latest) return true;
    if (latest.logoUid !== params.logoUid) return true;
    if ((latest.model ?? null) !== (params.model ?? null)) return true;

    return false;
  }

  async saveResult(params: {
    teamUid: string;
    logoUid: string | null;
    website: string | null;
    logoUrl: string | null;
    source: string;
    provider: string;
    model: string | null;
    result: LogoVerificationResult;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const saved = await tx.teamLogoVerificationResult.create({
        data: {
          teamUid: params.teamUid,
          logoUid: params.logoUid,
          website: params.website,
          logoUrl: params.logoUrl,
          source: params.source,
          provider: params.provider,
          model: params.model,
          verdict: params.result.verdict,
          confidence: params.result.confidence,
          quality: params.result.quality,
          hasReadableText: params.result.hasReadableText,
          predictedCompanyName: params.result.predictedCompanyName,
          reason: params.result.reason,
          brandSignals: params.result.brandSignals as any,
          rawResponse: params.result as any,
        },
      });

      this.logger.log(
        `Saved logo verification result for team=${params.teamUid}, provider=${params.provider}, verdict=${params.result.verdict}`
      );

      // Auto-promote the verified logo to Team.logo, mirroring how the text
      // judge promotes Enriched fields at `agrees + high`. Symmetry matters:
      // without this, `enrichment-review` would drop the team from the queue
      // (since `logoApprovedByVLM` clears it) while `Team.logo` still points
      // at the old / null image — admins would see no review needed but
      // public clients would keep showing the stale logo. Gated to the exact
      // logo the VLM actually scored (`params.logoUid`).
      if (
        params.result.verdict === 'verified' &&
        params.result.confidence === 'high' &&
        params.logoUid
      ) {
        await this.maybeAutoPromoteLogo(tx, params);
      }

      return saved;
    });
  }

  /**
   * Promote `TeamEnrichment.logoUid` → `Team.logo` when the VLM returned
   * `verified + high` for the exact logo currently on `TeamEnrichment`. Also
   * stamps `dataEnrichment.fieldsMeta.logo.judgment` with `agrees + high` so
   * `enrichment-review`'s `logoApprovedByAdmin` flag becomes true alongside
   * `logoApprovedByVLM` — keeps both approval signals consistent for any
   * future re-judge / admin re-open.
   *
   * Guards (any one false → no promotion):
   *   - `TeamEnrichment` row exists for the team.
   *   - `TeamEnrichment.logoUid === params.logoUid` — the cron's snapshot
   *     might be stale if a refetch ran between `getTeamsForVerification`
   *     and `saveResult`. Only the logo the VLM literally scored is safe
   *     to promote.
   *   - `fieldsMeta.logo.status !== ChangedByUser` — admin / user owns the
   *     logo. Same rule as `forceRefetchLogo` (`team-enrichment.service.ts`).
   */
  private async maybeAutoPromoteLogo(
    tx: Prisma.TransactionClient,
    params: {
      teamUid: string;
      logoUid: string | null;
      provider: string;
      result: LogoVerificationResult;
    }
  ): Promise<void> {
    const te = await tx.teamEnrichment.findUnique({
      where: { teamUid: params.teamUid },
      select: { logoUid: true, dataEnrichment: true },
    });
    if (!te || !te.logoUid) return;
    if (te.logoUid !== params.logoUid) {
      this.logger.log(
        `Logo auto-promote skipped for team=${params.teamUid}: TeamEnrichment.logoUid=${te.logoUid} differs from verified logoUid=${params.logoUid}`
      );
      return;
    }

    const meta = (te.dataEnrichment as unknown) as TeamDataEnrichment | null;
    const existingLogoMeta = meta?.fieldsMeta?.logo;
    if (existingLogoMeta?.status === FieldEnrichmentStatus.ChangedByUser) {
      this.logger.log(
        `Logo auto-promote skipped for team=${params.teamUid}: fieldsMeta.logo.status=ChangedByUser`
      );
      return;
    }

    const now = new Date().toISOString();
    const newLogoMeta: FieldEnrichmentMeta = {
      ...(existingLogoMeta ?? {}),
      status: existingLogoMeta?.status ?? FieldEnrichmentStatus.Enriched,
      judgment: {
        verdict: JudgmentVerdict.Agrees,
        confidence: FieldConfidence.High,
        score: 100,
        note: (params.result.reason ?? '').slice(0, FIELD_JUDGMENT_NOTE_MAX_LENGTH),
        judgedVia: JudgmentSource.AI,
      },
      lastModifiedAt: now,
    };

    const newDataEnrichment: TeamDataEnrichment | null = meta
      ? {
          ...meta,
          fieldsMeta: {
            ...(meta.fieldsMeta ?? {}),
            logo: newLogoMeta,
          },
          judgment: meta.judgment
            ? {
                ...meta.judgment,
                fieldsForReview: (meta.judgment.fieldsForReview ?? []).filter((f) => f !== 'logo'),
              }
            : meta.judgment,
        }
      : null;

    if (newDataEnrichment) {
      await tx.teamEnrichment.update({
        where: { teamUid: params.teamUid },
        data: { dataEnrichment: newDataEnrichment as any },
      });
    }
    await tx.team.update({
      where: { uid: params.teamUid },
      data: { logo: { connect: { uid: params.logoUid! } } },
    });

    this.logger.log(
      `Logo auto-promoted for team=${params.teamUid}: Team.logo → ${params.logoUid} (provider=${params.provider})`
    );
  }
}

import {
  BadRequestException,
  Body,
  CacheTTL,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { ZodValidationPipe } from '@abitia/zod-dto';

import { AdminTeamsService } from './admin-teams.service';
import {
  ApproveEnrichmentFieldsBodyDto,
  TriggerForceEnrichmentQueryDto,
  UploadTeamTiersQueryDto,
} from './schema/admin-teams';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
import { TeamEnrichmentJudgeService } from '../team-enrichment/team-enrichment-judge.service';
import { TeamEnrichmentReportService } from '../team-enrichment/team-enrichment-report.service';
import { TeamEnrichmentJob } from '../team-enrichment/team-enrichment.job';
import { TeamEnrichmentJudgeJob } from '../team-enrichment/team-enrichment-judge.job';

@ApiTags('Admin Teams')
@Controller('v1/admin/teams')
@UseGuards(AdminAuthGuard)
export class AdminTeamsController {
  constructor(
    private readonly adminTeamsService: AdminTeamsService,
    private readonly teamEnrichmentService: TeamEnrichmentService,
    private readonly teamEnrichmentJudgeService: TeamEnrichmentJudgeService,
    private readonly teamEnrichmentReportService: TeamEnrichmentReportService,
    private readonly teamEnrichmentJob: TeamEnrichmentJob,
    private readonly teamEnrichmentJudgeJob: TeamEnrichmentJudgeJob
  ) {}

  @Post('tiers/upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
      required: ['file'],
    },
  })
  @NoCache()
  @CacheTTL(0)
  async uploadTiers(
    @UploadedFile() file: Express.Multer.File,
    @Query(new ZodValidationPipe()) query: UploadTeamTiersQueryDto,
    @Req() req: any
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('CSV file is required (multipart/form-data; field name: file)');
    }

    if (file.mimetype !== 'text/csv' && !file.originalname.toLowerCase().endsWith('.csv')) {
      throw new BadRequestException('Only CSV files are allowed');
    }

    return this.adminTeamsService.importTiersFromCsv({
      csvBuffer: file.buffer,
      dryRun: query.dryRun,
      matchBy: query.matchBy,
      requestorEmail: req?.userEmail ?? 'system',
      delimiter: query.delimiter,
      encoding: query.encoding,
    });
  }

  /**
   * Admin: full team update using old ParticipantsRequest payload.
   */
  @Patch('/:uid/full')
  @NoCache()
  async adminUpdateTeamFull(@Param('uid') teamUid: string, @Body() body) {
    return this.adminTeamsService.updateTeam(teamUid, body);
  }

  @Patch('/:uid/enrichment-review')
  @NoCache()
  async reviewEnrichment(
    @Param('uid') uid: string,
    @Body() body: { status: 'Reviewed' | 'Approved' },
    @Req() req: any
  ) {
    if (!body.status || !['Reviewed', 'Approved'].includes(body.status)) {
      throw new BadRequestException('status must be "Reviewed" or "Approved"');
    }
    await this.teamEnrichmentService.reviewEnrichment(uid, body.status, req?.userEmail ?? 'admin');
    return { success: true };
  }

  /**
   * Full list of teams whose enrichment is in `EnrichmentStatus.Enriched`, including every
   * judged field regardless of confidence. The response carries both the live `teamLogo`
   * (`Team.logo`) and the candidate `logo` (`TeamEnrichment.logo`) so admins can compare.
   */
  @Get('enrichment-review')
  @NoCache()
  async listEnrichmentsForReview() {
    return this.teamEnrichmentService.listEnrichmentsForReview();
  }

  /**
   * Enrich + judge status snapshot for the enrichment + judge cron jobs.
   *
   * `isRunning` is a per-pod in-memory flag — accurate within this process, but if the API
   * runs as multiple replicas only one pod will see `true`. Pending / in-progress counts come
   * from the DB and are authoritative across pods.
   *
   * Declared before `/:uid/enrichment-status` so Nest routes the static segment first.
   */
  @Get('enrichment-status')
  @NoCache()
  async getEnrichmentCronStatus() {
    const counts = await this.teamEnrichmentService.getCronCounts();
    return {
      enrichment: {
        isRunning: this.teamEnrichmentJob.enrichmentRunning,
        pending: counts.enrichment.pending,
        inProgress: counts.enrichment.inProgress,
      },
      marking: { isRunning: this.teamEnrichmentJob.markingRunning },
      judge: {
        isRunning: this.teamEnrichmentJudgeJob.judgmentRunning,
        pending: counts.judge.pending,
        inProgress: counts.judge.inProgress,
      },
    };
  }

  /**
   * Per-team enrich + judge status snapshot — enrichment status (e.g. PendingEnrichment /
   * Enriched / Reviewed), `enrichedAt` / `judgedAt` timestamps, and judge `fieldsForReview`.
   * Returns 404 if the team uid doesn't exist; returns `enrichment: null` if the team has no
   * `TeamEnrichment` row yet.
   */
  @Get('/:uid/enrichment-status')
  @NoCache()
  async getEnrichmentStatus(@Param('uid') uid: string) {
    return this.teamEnrichmentService.getEnrichmentStatus(uid);
  }

  /**
   * Approve a list of enrichment fields for a team. Promotes the candidate values from
   * TeamEnrichment to Team (scalars + industryTags M2M + InvestorProfile.investmentFocus +
   * Team.logoUid), normalizes per-field judgment metadata (verdict=agrees, confidence=high,
   * score=90), flips `dataEnrichment.status` to `Reviewed`, and on logo approval also marks
   * the latest TeamLogoVerificationResult row `verified` at high confidence.
   */
  @Patch('/:uid/enrichment-review/fields')
  @NoCache()
  async approveEnrichmentFields(
    @Param('uid') uid: string,
    @Body(new ZodValidationPipe()) body: ApproveEnrichmentFieldsBodyDto,
    @Req() req: any
  ) {
    return this.teamEnrichmentService.approveEnrichmentFields(uid, body.fields, req?.userEmail ?? 'admin');
  }

  @Post('/:uid/trigger-enrichment')
  @NoCache()
  async triggerEnrichment(@Param('uid') uid: string) {
    const { status } = await this.teamEnrichmentService.enrichTeam(uid, 'manually');

    if (status === 'in_progress') {
      return { success: false, message: `Enrichment already in progress for team ${uid}` };
    }

    return { success: true, message: `Enrichment triggered for team ${uid}` };
  }

  @Post('trigger-enrichment')
  @NoCache()
  async triggerEnrichmentAll() {
    const result = await this.teamEnrichmentService.triggerEnrichmentForAllPending('manually');
    return { success: true, ...result, message: 'Enrichment triggered in background' };
  }

  @Post('/:uid/trigger-force-enrichment')
  @NoCache()
  async triggerForceEnrichment(
    @Param('uid') uid: string,
    @Query(new ZodValidationPipe()) query: TriggerForceEnrichmentQueryDto
  ) {
    const { status } = await this.teamEnrichmentService.forceEnrichTeam(uid, query.mode, 'manually');

    if (status === 'not_found') {
      throw new BadRequestException(`Team ${uid} not found`);
    }
    if (status === 'in_progress') {
      return { success: false, message: `Enrichment already in progress for team ${uid}` };
    }

    return { success: true, message: `Force enrichment (mode=${query.mode}) triggered for team ${uid}` };
  }

  @Post('trigger-force-enrichment')
  @NoCache()
  async triggerForceEnrichmentAll(@Query(new ZodValidationPipe()) query: TriggerForceEnrichmentQueryDto) {
    const result = await this.teamEnrichmentService.forceEnrichAllCompletedTeams(query.mode, 'manually');
    return {
      success: true,
      ...result,
      message: `Force enrichment (mode=${query.mode}) triggered in background`,
    };
  }

  @Post('/:uid/trigger-force-logo-refetch')
  @NoCache()
  async triggerForceLogoRefetch(@Param('uid') uid: string) {
    const { status } = await this.teamEnrichmentService.forceRefetchLogo(uid, 'manually');

    if (status === 'not_found') {
      throw new BadRequestException(`Team ${uid} not found`);
    }
    if (status === 'in_progress') {
      return { success: false, message: `Logo refetch already in progress for team ${uid}` };
    }
    if (status === 'skipped_user_owned') {
      return { success: false, message: `Team ${uid} logo is user-owned (ChangedByUser); skipping` };
    }
    if (status === 'no_source') {
      return { success: false, message: `Team ${uid} has no website or linkedinHandler; cannot refetch logo` };
    }

    return { success: true, message: `Logo refetch triggered for team ${uid}` };
  }

  @Post('trigger-force-logo-refetch')
  @NoCache()
  async triggerForceLogoRefetchAll() {
    const result = await this.teamEnrichmentService.forceRefetchLogoForAllTeams('manually');
    return {
      success: true,
      ...result,
      message: 'Logo refetch triggered in background',
    };
  }

  @Post('/:uid/trigger-judgment')
  @NoCache()
  async triggerJudgment(@Param('uid') uid: string) {
    const { status } = await this.teamEnrichmentJudgeService.judgeTeam(uid, 'manually');

    if (status === 'not_found') {
      throw new BadRequestException(`Team ${uid} not found`);
    }
    if (status === 'in_progress') {
      return { success: false, message: `Judgment already in progress for team ${uid}` };
    }
    if (status === 'already_judged') {
      return {
        success: false,
        message: `Team ${uid} already judged — use trigger-force-judgment to re-judge`,
      };
    }
    if (status === 'not_eligible') {
      return {
        success: false,
        message: `Team ${uid} is not eligible for judgment (must be Enriched with judgable fields)`,
      };
    }

    return { success: true, message: `Judgment triggered for team ${uid}` };
  }

  @Post('trigger-judgment')
  @NoCache()
  async triggerJudgmentAll() {
    const result = await this.teamEnrichmentJudgeService.triggerJudgmentForAllPending('manually');
    return { success: true, ...result, message: 'Judgment triggered in background' };
  }

  @Post('/:uid/trigger-force-judgment')
  @NoCache()
  async triggerForceJudgment(@Param('uid') uid: string) {
    const { status } = await this.teamEnrichmentJudgeService.forceJudgeTeam(uid, 'manually');

    if (status === 'not_found') {
      throw new BadRequestException(`Team ${uid} not found`);
    }
    if (status === 'in_progress') {
      return { success: false, message: `Judgment already in progress for team ${uid}` };
    }
    if (status === 'not_eligible') {
      return { success: false, message: `Team ${uid} has no judgable fields` };
    }

    return { success: true, message: `Force-judgment triggered for team ${uid}` };
  }

  /**
   * Aggregated AI token usage + USD cost report for the enrichment + judge pipelines.
   * Reads `TeamEnrichment.dataEnrichment.usage` persisted on each team and rolls up totals, per-model
   * breakdowns, and per-team usage. Teams are sorted by combined cost desc and paginated.
   *
   * Query params:
   *  - since=<ISO8601> — filter per-stage usage by `lastRunAt >= since` (each stage filtered independently).
   *  - page=<int>     — 1-based page index for the `teams` list (default 1).
   *  - pageSize=<int> — items per page for the `teams` list (default 10, capped at 100).
   *
   * `totals` and `byModel` are always computed over the full result set, regardless of pagination.
   *
   * Costs are estimates from the in-app pricing table (`team-enrichment-cost.ts`).
   * Token counts are exact and are the source of truth.
   */
  @Get('ai-report')
  @NoCache()
  async aiReport(
    @Query('since') since?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string
  ) {
    return this.teamEnrichmentReportService.generateReport({
      since,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

}

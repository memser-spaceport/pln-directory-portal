import { Body, Controller, Get, Param, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import type { IntegrationKeyRequestContext } from '../integration-keys/integration-keys.service';
import { JobOpeningsIntegrationService } from './job-openings-integration.service';
import { ClaimJobDto, JobStatePatchDto, PublishableJobDto } from './dto/publishable-job.dto';

type IntegrationRequest = { integrationKey: IntegrationKeyRequestContext };

/**
 * Job openings authored by an integrated system (for example a team's ATS) through
 * a team-scoped key with the `jobs:write` scope. Every route acts only on the key's
 * team. Exempt from the member rate limiter, which the throttler bypass would
 * otherwise apply since only the `v1/service` prefix is skipped by path.
 */
@ApiTags('Integrations - Jobs')
@Controller('v1/integrations/jobs')
@UseGuards(IntegrationKeyGuard)
@RequireIntegrationScopes('jobs:write')
@SkipThrottle()
@NoCache()
export class JobOpeningsIntegrationController {
  constructor(private readonly integrationJobs: JobOpeningsIntegrationService) {}

  /** The key's team's rows in every status, with the caller's external id where it owns the row. */
  @Get()
  async list(@Req() req: IntegrationRequest) {
    return this.integrationJobs.listForTeam(req.integrationKey);
  }

  /** Create or replace the public record of the role the key knows as `externalId`. */
  @Put(':externalId')
  async upsert(
    @Param('externalId') externalId: string,
    @Body(new ZodValidationPipe()) body: PublishableJobDto,
    @Req() req: IntegrationRequest
  ) {
    return this.integrationJobs.upsertByExternalId(req.integrationKey, externalId, body);
  }

  @Patch(':externalId/state')
  async setState(
    @Param('externalId') externalId: string,
    @Body(new ZodValidationPipe()) body: JobStatePatchDto,
    @Req() req: IntegrationRequest
  ) {
    return this.integrationJobs.setState(req.integrationKey, externalId, body.state);
  }

  /** Adopt an existing row of the key's team by Directory uid. */
  @Post('claim')
  async claim(@Body(new ZodValidationPipe()) body: ClaimJobDto, @Req() req: IntegrationRequest) {
    return this.integrationJobs.claim(req.integrationKey, body.uid, body.externalId);
  }
}

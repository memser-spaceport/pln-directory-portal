import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { IntegrationCandidatesService } from './integration-candidates.service';
import { IntegrationKeysService, IntegrationKeyRequestContext } from './integration-keys.service';

/**
 * Routes for an integrated third-party server (for example a team's ATS),
 * authenticated by a team-scoped integration key. Exempt from the member rate
 * limiter: the throttler bypass matches only the `v1/service` prefix, so the
 * exemption is declared here.
 */
@ApiTags('Integrations')
@Controller('v1/integrations')
@UseGuards(IntegrationKeyGuard)
@SkipThrottle()
@NoCache()
export class IntegrationsController {
  constructor(
    private readonly integrationKeys: IntegrationKeysService,
    private readonly candidates: IntegrationCandidatesService
  ) {}

  /** The calling key describing itself, so an integrator can verify its configuration. */
  @Get('me')
  async me(@Req() req: { integrationKey: IntegrationKeyRequestContext }) {
    return this.integrationKeys.describe(req.integrationKey);
  }

  /**
   * The key's team's applications and interests, oldest first, for incremental
   * sync. Pass back `nextCursor` until it is null; `since` re-reads a window
   * without one.
   */
  @Get('candidates')
  @RequireIntegrationScopes('candidates:read')
  async candidatesFeed(
    @Req() req: { integrationKey: IntegrationKeyRequestContext },
    @Query('cursor') cursor?: string,
    @Query('since') since?: string,
    @Query('limit') limit?: string
  ) {
    return this.candidates.feed(req.integrationKey.teamUid, {
      cursor,
      since,
      limit: limit ? Number(limit) : undefined,
    });
  }

  /** A freshly signed link to an applicant's CV; the one in the feed expires. */
  @Get('candidates/applications/:uid/cv')
  @RequireIntegrationScopes('candidates:read')
  async applicationCv(@Req() req: { integrationKey: IntegrationKeyRequestContext }, @Param('uid') uid: string) {
    return this.candidates.applicationCvUrl(req.integrationKey.teamUid, uid);
  }
}

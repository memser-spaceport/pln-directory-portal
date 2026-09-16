import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { NoCache } from '../decorators/no-cache.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
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
  constructor(private readonly integrationKeys: IntegrationKeysService) {}

  /** The calling key describing itself, so an integrator can verify its configuration. */
  @Get('me')
  async me(@Req() req: { integrationKey: IntegrationKeyRequestContext }) {
    return this.integrationKeys.describe(req.integrationKey);
  }
}

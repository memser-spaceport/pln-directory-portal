import { Controller, Delete, HttpCode, HttpStatus, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import type { IntegrationKeyRequestContext } from './integration-keys.service';

/** PLAA keys may manage plaa.access across teams; teamUid identifies the key owner only. */
@ApiTags('PLAA Integration')
@Controller('v1/integrations/plaa')
@UseGuards(IntegrationKeyGuard)
@NoCache()
export class PlaaAccessController {
  private readonly logger = new Logger(PlaaAccessController.name);

  constructor(private readonly accessControl: AccessControlV2Service) {}

  @Post('members/:memberUid/access')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async grant(@Param('memberUid') memberUid: string, @Req() req: { integrationKey: IntegrationKeyRequestContext }) {
    await this.accessControl.grantDirectPermission(memberUid, 'plaa.access', undefined, `PLAA integration key ${req.integrationKey.uid}`);
    this.logger.log(`PLAA access granted: keyUid=${req.integrationKey.uid} memberUid=${memberUid}`);
    return { ok: true };
  }

  @Delete('members/:memberUid/access')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async revoke(@Param('memberUid') memberUid: string, @Req() req: { integrationKey: IntegrationKeyRequestContext }) {
    const result = await this.accessControl.revokeDirectPermission(memberUid, 'plaa.access');
    this.logger.log(`PLAA access revoked: keyUid=${req.integrationKey.uid} memberUid=${memberUid} removed=${result.removed}`);
    return result;
  }
}

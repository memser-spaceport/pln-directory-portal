import { Body, Controller, Delete, HttpCode, HttpStatus, Logger, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { NoCache } from '../decorators/no-cache.decorator';
import { RequireIntegrationScopes } from '../decorators/require-integration-scopes.decorator';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import type { IntegrationKeyRequestContext } from './integration-keys.service';
import { PlaaPermissionRequestDto } from './integration-keys.dto';

type PlaaRequest = { integrationKey: IntegrationKeyRequestContext };

/** PLAA keys may manage PLAA permissions across teams; teamUid identifies the key owner only. */
@ApiTags('PLAA Integration')
@Controller('v1/integrations/plaa')
@UseGuards(IntegrationKeyGuard)
@NoCache()
export class PlaaAccessController {
  private readonly logger = new Logger(PlaaAccessController.name);

  constructor(private readonly accessControl: AccessControlV2Service) {}

  /** Legacy: grants `plaa.access`. */
  @Post('members/:memberUid/access')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async grant(@Param('memberUid') memberUid: string, @Req() req: PlaaRequest) {
    await this.accessControl.grantDirectPermission(memberUid, 'plaa.access', undefined, `PLAA integration key ${req.integrationKey.uid}`);
    this.logger.log(`PLAA access granted: keyUid=${req.integrationKey.uid} memberUid=${memberUid}`);
    return { ok: true };
  }

  /** Legacy: revokes `plaa.access`. */
  @Delete('members/:memberUid/access')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async revoke(@Param('memberUid') memberUid: string, @Req() req: PlaaRequest) {
    const result = await this.accessControl.revokeDirectPermission(memberUid, 'plaa.access');
    this.logger.log(`PLAA access revoked: keyUid=${req.integrationKey.uid} memberUid=${memberUid} removed=${result.removed}`);
    return result;
  }

  /** Grants one PLAA permission from the body. Same approval checks as the legacy route. */
  @Post('members/:memberUid/permissions/grant')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async grantPermission(
    @Param('memberUid') memberUid: string,
    @Body(ZodValidationPipe) { permission }: PlaaPermissionRequestDto,
    @Req() req: PlaaRequest
  ) {
    await this.accessControl.grantDirectPermission(memberUid, permission, undefined, `PLAA integration key ${req.integrationKey.uid}`);
    this.logger.log(`PLAA permission granted: keyUid=${req.integrationKey.uid} memberUid=${memberUid} permission=${permission}`);
    return { ok: true, permission };
  }

  /** Revokes one PLAA permission from the body. Revoking a permission the member lacks returns `removed: false`. */
  @Post('members/:memberUid/permissions/revoke')
  @HttpCode(HttpStatus.OK)
  @RequireIntegrationScopes('plaa:access:manage')
  async revokePermission(
    @Param('memberUid') memberUid: string,
    @Body(ZodValidationPipe) { permission }: PlaaPermissionRequestDto,
    @Req() req: PlaaRequest
  ) {
    const result = await this.accessControl.revokeDirectPermission(memberUid, permission);
    this.logger.log(
      `PLAA permission revoked: keyUid=${req.integrationKey.uid} memberUid=${memberUid} permission=${permission} removed=${result.removed}`
    );
    return { ...result, permission };
  }
}

import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { RbacGuard } from '../../rbac/rbac.guard';
import { RbacService } from '../../rbac/rbac.service';
import { AiAppsAudienceService } from '../ai-apps-audience.service';

/**
 * RBAC for `GET /v1/ai-apps/me`. A testing-user session has no Member row, so the permission check is skipped
 * for it; a real member still goes through `RbacGuard`. A member without the permission passes when the request
 * carries an app session for an app whose audience they are in (LAB-3200).
 */
@Injectable()
export class AiAppMeRbacGuard extends RbacGuard implements CanActivate {
  constructor(
    reflector: Reflector,
    rbacService: RbacService,
    accessControlV2Service: AccessControlV2Service,
    @Optional() private readonly audienceService?: AiAppsAudienceService
  ) {
    super(reflector, rbacService, accessControlV2Service);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.aiAppTestingUser) {
      return true;
    }
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (
        error instanceof ForbiddenException &&
        req.aiAppSessionAppId &&
        (await this.audienceService?.isInAudienceOfAppId(req.memberUid, req.aiAppSessionAppId))
      ) {
        return true;
      }
      throw error;
    }
  }
}

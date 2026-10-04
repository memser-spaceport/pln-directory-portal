import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { RbacGuard } from '../../rbac/rbac.guard';
import { RbacService } from '../../rbac/rbac.service';

/**
 * RBAC for `GET /v1/ai-apps/me`. A testing-user session has no Member row, so the permission check is skipped
 * for it; a real member still goes through `RbacGuard`.
 */
@Injectable()
export class AiAppMeRbacGuard extends RbacGuard implements CanActivate {
  constructor(reflector: Reflector, rbacService: RbacService, accessControlV2Service: AccessControlV2Service) {
    super(reflector, rbacService, accessControlV2Service);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.aiAppTestingUser) {
      return true;
    }
    return super.canActivate(context);
  }
}

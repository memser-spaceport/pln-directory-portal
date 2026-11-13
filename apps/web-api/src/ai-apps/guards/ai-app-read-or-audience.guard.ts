import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessControlV2Service } from '../../access-control-v2/services/access-control-v2.service';
import { RbacGuard } from '../../rbac/rbac.guard';
import { RbacService } from '../../rbac/rbac.service';
import { AiAppsAudienceService } from '../ai-apps-audience.service';
import { normalizeAppTarget } from '../ai-apps.constants';

/**
 * RBAC for app sign-in (`POST sessions/code`, `sessions/exchange-token`). A member with the route's AI Apps
 * permission passes as before. A member without it passes only for the production target of an app whose
 * audience they are in (LAB-3200); the body's `appId` names the app.
 */
@Injectable()
export class AiAppReadOrAudienceGuard extends RbacGuard implements CanActivate {
  constructor(
    reflector: Reflector,
    private readonly members: RbacService,
    accessControlV2Service: AccessControlV2Service,
    private readonly audienceService: AiAppsAudienceService
  ) {
    super(reflector, members, accessControlV2Service);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
      const req = context.switchToHttp().getRequest();
      const appId = typeof req.body?.appId === 'string' ? req.body.appId : undefined;
      if (appId && normalizeAppTarget(req.body?.target) === 'prod') {
        const memberUid = await this.resolveMemberUid(req);
        if (await this.audienceService.isInAudienceOfAppId(memberUid, appId)) {
          return true;
        }
      }
      throw error;
    }
  }

  /** The same identity `RbacGuard` resolves: the uid on the request, else the member behind its email. */
  private async resolveMemberUid(req: any): Promise<string | undefined> {
    const memberUid = req.memberUid ?? req.user?.memberUid ?? req.user?.sub;
    if (memberUid) {
      return memberUid;
    }
    const email = req.userEmail ?? req.user?.email;
    const member = email ? await this.members.findMemberByEmail(email) : null;
    return member?.uid;
  }
}

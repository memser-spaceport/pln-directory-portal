import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_PERMISSIONS_KEY } from './rbac.decorator';
import { RbacService } from './rbac.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';

const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  'founder_guides.view': [
    'founder_guides.view.all',
    'founder_guides.view.plvs',
    'founder_guides.view.plcc',
  ],
  'founder_guides.create': ['founder_guides.create'],
  'deals.view': ['deals.read'],
  'demo_day.report_link.view': ['demo_day.report_link.view'],
};

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
    private readonly accessControlV2Service: AccessControlV2Service,
  ) {}

  private getPermissionCandidates(permission: string): string[] {
    return Array.from(new Set([permission, ...(LEGACY_PERMISSION_ALIASES[permission] ?? [])]));
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(RBAC_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!requiredPermissions.length) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const memberUid = req.memberUid ?? req.user?.memberUid ?? req.user?.sub;
    const userEmail = req.userEmail ?? req.user?.email;

    let resolvedMemberUid: string | null = null;

    if (memberUid) {
      const member = await this.rbacService.findMemberByUid(memberUid);
      if (!member) {
        throw new ForbiddenException(`Member not found for uid: ${memberUid}`);
      }
      resolvedMemberUid = member.uid;
    } else if (userEmail) {
      const member = await this.rbacService.findMemberByEmail(userEmail);

      if (!member) {
        throw new ForbiddenException(`Member not found for email: ${userEmail}`);
      }

      resolvedMemberUid = member.uid;
    } else {
      throw new ForbiddenException('User identity is missing for RBAC check');
    }

    for (const permission of requiredPermissions) {
      const candidates = this.getPermissionCandidates(permission);

      let allowedByV2 = false;
      for (const candidate of candidates) {
        try {
          const check = await this.accessControlV2Service.hasPermission(resolvedMemberUid, candidate);
          if (check.allowed) {
            allowedByV2 = true;
            break;
          }
        } catch {
          // Intentionally fall through to v1 check.
        }
      }

      if (allowedByV2) {
        continue;
      }

      const allowedByV1 = await this.rbacService.hasPermission(resolvedMemberUid, permission);
      if (!allowedByV1) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }

    return true;
  }
}

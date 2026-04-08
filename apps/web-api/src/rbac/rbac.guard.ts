import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_PERMISSIONS_KEY } from './rbac.decorator';
import { RbacService } from './rbac.service';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

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
    const memberUid = req.memberUid ?? req.user?.memberUid;
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
      const allowed = await this.rbacService.hasPermission(resolvedMemberUid, permission);
      if (!allowed) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }

    return true;
  }
}

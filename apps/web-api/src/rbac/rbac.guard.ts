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
    const userEmail = req.userEmail;

    if (!userEmail) {
      throw new ForbiddenException('User email is missing for RBAC check');
    }

    const member = await this.rbacService.findMemberByEmail(userEmail);

    if (!member) {
      throw new ForbiddenException(`Member not found for email: ${userEmail}`);
    }

    for (const permission of requiredPermissions) {
      const allowed = await this.rbacService.hasPermission(member.uid, permission);
      if (!allowed) {
        throw new ForbiddenException(`Missing permission: ${permission}`);
      }
    }

    return true;
  }
}

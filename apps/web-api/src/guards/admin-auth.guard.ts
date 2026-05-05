import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';
import { ADMIN_PERMISSIONS, DEMODAY_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { MemberRole } from '../utils/constants';

/**
 * Base class for admin authentication guards.
 * Validates JWT token and checks for required roles.
 */
abstract class BaseAdminAuthGuard implements CanActivate {
  constructor(protected jwtService: JwtService) {}

  protected abstract getAllowedRoles(): MemberRole[];

  protected getAllowedPermissions(): string[] {
    return [];
  }

  protected allowsPermissionPrefix(_permissionCode: string): boolean {
    return false;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      const payload = await this.jwtService.validateToken(token);
      // 💡 We're assigning the payload to the request object here
      // so that we can access it in our route handlers
      request['user'] = payload;

      // Verify user has at least one of the allowed roles
      const roles: string[] = payload.roles || [];
      const permissions: string[] = payload.permissions || payload.effectivePermissionCodes || [];
      const allowedRoles = this.getAllowedRoles();
      const allowedPermissions = this.getAllowedPermissions();
      const hasValidRole = roles.some((role) => allowedRoles.includes(role as MemberRole));
      const hasValidPermission = permissions.some(
        (permission) => allowedPermissions.includes(permission) || this.allowsPermissionPrefix(permission)
      );

      if (!hasValidRole && !hasValidPermission) {
        throw new ForbiddenException('User does not have the required admin permission');
      }
    } catch (e) {
      if (e instanceof ForbiddenException) {
        throw e;
      }
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

/**
 * Guard that only allows DIRECTORY_ADMIN users.
 * Use for sensitive operations like managing roles, members, teams, etc.
 */
@Injectable()
export class AdminAuthGuard extends BaseAdminAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  protected getAllowedRoles(): MemberRole[] {
    return [MemberRole.DIRECTORY_ADMIN];
  }

  protected getAllowedPermissions(): string[] {
    return [ADMIN_PERMISSIONS.DIRECTORY_FULL];
  }
}

/**
 * Guard that allows both DIRECTORY_ADMIN and DEMO_DAY_ADMIN users.
 * Use for Demo Day related operations.
 */
@Injectable()
export class DemoDayAdminAuthGuard extends BaseAdminAuthGuard {
  constructor(jwtService: JwtService) {
    super(jwtService);
  }

  protected getAllowedRoles(): MemberRole[] {
    return [];
  }

  protected getAllowedPermissions(): string[] {
    return [ADMIN_PERMISSIONS.DIRECTORY_FULL, DEMODAY_PERMISSIONS.ADMIN_ALL];
  }

  protected allowsPermissionPrefix(permissionCode: string): boolean {
    return permissionCode.startsWith('demoday.admin.');
  }
}

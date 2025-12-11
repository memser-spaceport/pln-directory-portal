import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';
import { MemberRole } from '../utils/constants';

/**
 * Base class for admin authentication guards.
 * Validates JWT token and checks for required roles.
 */
abstract class BaseAdminAuthGuard implements CanActivate {
  constructor(protected jwtService: JwtService) {}

  protected abstract getAllowedRoles(): MemberRole[];

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
      const allowedRoles = this.getAllowedRoles();
      const hasValidRole = roles.some((role) => allowedRoles.includes(role as MemberRole));

      if (!hasValidRole) {
        throw new ForbiddenException('User does not have the required admin role');
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
    return [MemberRole.DIRECTORY_ADMIN, MemberRole.DEMO_DAY_ADMIN];
  }
}

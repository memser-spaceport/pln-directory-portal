import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';
import { MemberRole } from '../utils/constants';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { ADMIN_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';

abstract class BaseAdminAuthGuard implements CanActivate {
  constructor(
    protected jwtService: JwtService,
    protected accessControlV2Service: AccessControlV2Service
  ) {}

  protected abstract getAllowedRoles(): MemberRole[];

  private async hasRequiredAccess(payload: any): Promise<boolean> {
    const roles: string[] = payload.roles || [];
    const allowedRoles = this.getAllowedRoles();

    const hasLegacyRole = roles.some((role) => allowedRoles.includes(role as MemberRole));
    if (hasLegacyRole) {
      return true;
    }

    const requiresDirectoryAdmin = allowedRoles.includes(MemberRole.DIRECTORY_ADMIN);
    if (!requiresDirectoryAdmin) {
      return false;
    }

    const memberUid = payload.memberUid ?? payload.sub;
    if (!memberUid) {
      return false;
    }

    const result = await this.accessControlV2Service.hasPermission(
      memberUid,
      ADMIN_PERMISSIONS.DIRECTORY_FULL
    );

    return result.allowed;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException();
    }

    try {
      const payload = await this.jwtService.validateToken(token);
      request['user'] = payload;

      const hasValidAccess = await this.hasRequiredAccess(payload);

      if (!hasValidAccess) {
        throw new ForbiddenException('User does not have the required admin access');
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

@Injectable()
export class AdminAuthGuard extends BaseAdminAuthGuard {
  constructor(jwtService: JwtService, accessControlV2Service: AccessControlV2Service) {
    super(jwtService, accessControlV2Service);
  }

  protected getAllowedRoles(): MemberRole[] {
    return [MemberRole.DIRECTORY_ADMIN];
  }
}

@Injectable()
export class DemoDayAdminAuthGuard extends BaseAdminAuthGuard {
  constructor(jwtService: JwtService, accessControlV2Service: AccessControlV2Service) {
    super(jwtService, accessControlV2Service);
  }

  protected getAllowedRoles(): MemberRole[] {
    return [MemberRole.DIRECTORY_ADMIN, MemberRole.DEMO_DAY_ADMIN];
  }
}

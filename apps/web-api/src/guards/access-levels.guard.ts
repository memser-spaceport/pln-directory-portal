import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ACCESS_LEVELS_KEY } from '../decorators/access-levels.decorator';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import axios from 'axios';
import { AccessLevel } from 'libs/contracts/src/schema/admin-member';
import {MemberService} from "../admin/member.service";

@Injectable()
export class AccessLevelsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private memberService: MemberService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredAccessLevels = this.reflector.getAllAndOverride<AccessLevel[]>(ACCESS_LEVELS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredAccessLevels || requiredAccessLevels.length === 0) {
      return true; // no roles required, allow
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    try {
      const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });
      if (validationResult?.data?.active && validationResult?.data?.email) {
        const email = validationResult.data.email;

        const userAccessLevel = await this.memberService.getAccessLevelByMemberEmail(email);
        if (!userAccessLevel) {
          return false;
        }

        if (this.isValidAccessLevel(userAccessLevel) && requiredAccessLevels.includes(userAccessLevel)) {
          return true;
        }
      }
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error?.response?.status === 400 ||
        error?.response?.status === 401
      ) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }
      throw new InternalServerErrorException('Unexpected Error');
    }

    return false;
  }

  private isValidAccessLevel(role: unknown): role is AccessLevel {
    return typeof role === 'string' && Object.values(AccessLevel).includes(role as AccessLevel);
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

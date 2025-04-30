import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { MembersService } from '../members/members.service';
import axios from 'axios';

@Injectable()
export class ActiveMemberEmailGuard implements CanActivate {
  constructor(protected membersService: MembersService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Invalid Session. Please login and try again');
    }
    const validationResult: any = await axios.post(
      `${process.env.AUTH_API_URL}/auth/introspect`,
      { token: token }
    );
    if (
      validationResult?.data?.active &&
      validationResult?.data?.email
    ) {
      const member = await this.membersService.findMemberByEmail(validationResult.data.email);
      if (!member) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }
      return true;
    } else {
      throw new UnauthorizedException();
    }
  }

  protected extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
} 
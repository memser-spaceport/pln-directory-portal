import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class UserAuthValidateGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token && request.method !== 'GET') {
      throw new UnauthorizedException();
    }

    if (!token && request.method === 'GET') {
      return true;
    }

    try {
      const validationResult: any = await axios.post(
        `${process.env.AUTH_API_URL}/auth/validate`,
        { token: token }
      );

      if (!validationResult?.data?.isTokenValid && request.method !== 'GET') {
        throw new UnauthorizedException();
      }

      if (validationResult?.data?.isTokenValid) {
        request['isUserLoggedIn'] = true;
      }
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

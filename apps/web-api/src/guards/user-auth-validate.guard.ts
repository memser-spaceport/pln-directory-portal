import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
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
    } catch (error) {
      if (error?.response?.data?.message && error?.response?.status) {
        throw new HttpException(
          error?.response?.data?.message,
          error?.response?.status
        );
      } else if (error?.response?.message && error?.status) {
        throw new HttpException(error?.response?.message, error?.status);
      }
      throw new InternalServerErrorException('Unexpected Error');
    }
    return true;
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

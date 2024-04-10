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
        `${process.env.AUTH_API_URL}/auth/introspect`,
        { token: token }
      );
      if (
        validationResult?.data?.active &&
        validationResult?.data?.email
      ) {
        request['isUserLoggedIn'] = true;
      }

      if (!validationResult?.data?.active && request.method !== 'GET') {
        throw new UnauthorizedException();
      }
    } catch (error) {
      if ( error instanceof UnauthorizedException || error?.response?.status === 400
        || error?.response?.status === 401) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
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

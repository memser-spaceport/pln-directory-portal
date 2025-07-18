import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { extractTokenFromRequest } from '../utils/auth';

@Injectable()
export class UserAuthValidateGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(request);

    if (!token && request.method !== 'GET') {
      throw new UnauthorizedException();
    }
    if (!token && request.method === 'GET') {
      return true;
    }
    try {
      const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });

      if (validationResult?.data?.active && validationResult?.data?.email) {
        request['isUserLoggedIn'] = true;
        request['userEmail'] = validationResult.data.email;
      }

      if (!validationResult?.data?.active && request.method !== 'GET') {
        throw new UnauthorizedException();
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
    return true;
  }
}

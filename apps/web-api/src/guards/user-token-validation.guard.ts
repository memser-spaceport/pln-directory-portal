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
export class UserTokenValidation implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const token = extractTokenFromRequest(request);
      if (!token) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }
      const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });
      if (validationResult?.data?.active && validationResult?.data?.email) {
        request['userEmail'] = validationResult.data.email;
      } else {
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
      throw new InternalServerErrorException();
    }
    return true;
  }
}

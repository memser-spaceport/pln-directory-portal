import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';
import { extractTokenFromRequest } from '../utils/auth';

@Injectable()
export class UserAccessTokenValidateGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractTokenFromRequest(request);

    // If no token throw Exception
    if (!token) {
      throw new UnauthorizedException('Unauthorized Access');
    }

    // If token validation fails throw Exception
    try {
      const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });
      if (!validationResult?.data?.active) {
        throw new UnauthorizedException('Invalid Session. Please login and try again');
      }

      // If user email is available in token set it in request. No Validation error if no email.
      if (validationResult?.data?.email) {
        request['userEmail'] = validationResult.data.email;
        request['userUid'] = validationResult.data.sub;
        request['userAccessToken'] = token;
      }
    } catch (error) {
      // If known error, handle it
      if (error?.response?.data?.message && error?.response?.status) {
        throw new HttpException(error?.response?.data?.message, error?.response?.status);
      } else if (error?.response?.message && error?.status) {
        throw new HttpException(error?.response?.message, error?.status);
      }
      throw new InternalServerErrorException('Unexpected Error');
    }
    return true;
  }
}

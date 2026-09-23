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

/**
 * Validates the request's access token (Bearer header or `authToken` cookie)
 * against the auth service and, when the token carries an email, sets
 * `userEmail`/`userUid`/`userAccessToken` on the request. Throws 401 for a
 * missing or inactive token. Shared by `UserAccessTokenValidateGuard` and
 * handlers that must decide something before requiring auth.
 */
export async function validateUserAccessToken(request: any): Promise<void> {
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
}

@Injectable()
export class UserAccessTokenValidateGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await validateUserAccessToken(context.switchToHttp().getRequest());
    return true;
  }
}

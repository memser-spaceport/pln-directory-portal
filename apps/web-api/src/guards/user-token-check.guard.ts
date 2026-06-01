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
export class UserTokenCheckGuard implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    // If token validation fails throw Exception
    try {
      if (token) {
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

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

/**
 * Sets request.userEmail / userUid when a valid Bearer token is present.
 * Invalid, expired, or inactive tokens do not block the request (public routes).
 */
@Injectable()
export class OptionalUserTokenCheckGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      return true;
    }
    try {
      const validationResult: any = await axios.post(`${process.env.AUTH_API_URL}/auth/introspect`, { token: token });
      if (!validationResult?.data?.active) {
        return true;
      }
      if (validationResult?.data?.email) {
        request['userEmail'] = validationResult.data.email;
        request['userUid'] = validationResult.data.sub;
        request['userAccessToken'] = token;
      }
    } catch {
      // Treat as anonymous for public endpoints
    }
    return true;
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class UserTokenValidation implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(request);

      // If no token then no validation required. Return
      if (!token) {
        return true;
      }

      const validationResult: any = await axios.post(
        `${process.env.AUTH_API_URL}/auth/introspect`,
        { token: token }
      );
      if (
        validationResult?.data?.active &&
        validationResult?.data?.email
      ) {
        // request['userExternaId'] = validationResult.data.sub;
        request['userEmail'] = validationResult.data.email;
      } else {
        throw new UnauthorizedException();
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

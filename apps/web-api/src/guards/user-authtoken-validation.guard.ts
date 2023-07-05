import {
  CanActivate,
  ExecutionContext,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class UserAuthTokenValidation implements CanActivate {
  constructor() {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const request = context.switchToHttp().getRequest();
      const token = this.extractTokenFromHeader(request);
      if (!token) {
        throw new UnauthorizedException('Invalid Token');
      }
      const validationResult: any = await axios.post(
        `${process.env.AUTH_API_URL}/auth/introspect`,
        { token: token }
      );
      if (!validationResult?.data?.active) {
        throw new UnauthorizedException();
      }

    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error?.response?.status === 400 ||
        error?.response?.status === 401
      ) {
        throw new UnauthorizedException('Invalid Token');
      }
      throw new InternalServerErrorException();
    }
    return true;
  }

  private extractTokenFromHeader(request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

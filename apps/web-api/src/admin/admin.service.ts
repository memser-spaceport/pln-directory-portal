import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';

@Injectable()
export class AdminService {
  constructor(private readonly jwtService: JwtService) {}

  async signIn(username: string, pass: string): Promise<any> {
    const usernameFromEnv = process.env.ADMIN_USERNAME;
    const passwordFromEnv = process.env.ADMIN_PASSWORD;

    if (username !== usernameFromEnv || passwordFromEnv !== pass) {
      throw new UnauthorizedException();
    }

    const accessToken = await this.jwtService.getSignedToken();
    return { code: 1, accessToken: accessToken };
  }
}

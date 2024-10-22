import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';

@Injectable()
export class AdminService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Validates given username and password for the admin against the env config and
   * creates a signed jwt token if credentials are valid else, throws {@link UnauthorizedException}
   * @param username admin username
   * @param password admin password
   * @returns a signed jwt token in json format {code: 1, accessToken: <token>} if crdentials valid
   * @throws UnauthorizedException if credentials not valid
   */
  async signIn(username: string, password: string): Promise<any> {
    const usernameFromEnv = process.env.ADMIN_USERNAME;
    const passwordFromEnv = process.env.ADMIN_PASSWORD;

    if (username !== usernameFromEnv || passwordFromEnv !== password) {
      throw new UnauthorizedException();
    }
    const accessToken = await this.jwtService.getSignedToken(['DIRECTORYADMIN']);
    return { code: 1, accessToken: accessToken };
  }
}

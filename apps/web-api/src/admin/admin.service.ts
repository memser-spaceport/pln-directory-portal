import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';
import { LogService } from '../shared/log.service'; 

@Injectable()
export class AdminService {
  constructor(
    private readonly jwtService: JwtService,
    private logger: LogService,
  ) {}

  /**
   * Logs in the admin using the provided username and password.
   * Validates credentials from environment variables.
   * @param username - Admin username
   * @param password - Admin password
   * @returns Object containing access token on successful login
   * @throws UnauthorizedException if credentials are invalid
   */
  async login(username: string, password: string): Promise<{ code:Number, accessToken: string }> {
    if (!this.isValidAdminCredentials(username, password)) {
      this.logger.error('Invalid credentials provided for admin login.');
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.info('Generating admin access token...');
    const accessToken = await this.jwtService.getSignedToken(['DIRECTORYADMIN']);
    return { code: 1, accessToken: accessToken };
  }

  /**
   * Validates the provided credentials against stored environment variables.
   * @param username - Input username
   * @param password - Input password
   * @returns Boolean indicating if credentials are valid
   */
  private isValidAdminCredentials(username: string, password: string): boolean {
    const validUsername = process.env.ADMIN_LOGIN_USERNAME;
    const validPassword = process.env.ADMIN_LOGIN_PASSWORD;
    return username === validUsername && password === validPassword;
  }
}

import { createHash, timingSafeEqual } from 'crypto';
import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';
import { LogService } from '../shared/log.service';
import { MemberRole } from '../utils/constants';

@Injectable()
export class AdminService {
  constructor(private readonly jwtService: JwtService, private logger: LogService) {}

  /**
   * Logs in the admin using the provided username and password.
   * Validates credentials from environment variables.
   * @param username - Admin username
   * @param password - Admin password
   * @returns Object containing access token on successful login
   * @throws NotFoundException when ADMIN_LEGACY_LOGIN_ENABLED is not true
   * @throws UnauthorizedException if credentials are invalid
   */
  async login(username: string, password: string): Promise<{ code: number; accessToken: string }> {
    if (process.env.ADMIN_LEGACY_LOGIN_ENABLED !== 'true') {
      throw new NotFoundException();
    }
    if (!this.isValidAdminCredentials(username, password)) {
      this.logger.error('Invalid credentials provided for admin login.');
      throw new UnauthorizedException('Invalid credentials');
    }
    this.logger.info('Generating admin access token...');
    const accessToken = await this.jwtService.getSignedToken([MemberRole.DIRECTORY_ADMIN]);
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
    if (!validUsername || !validPassword) return false;
    const usernameMatches = safeEqual(username, validUsername);
    const passwordMatches = safeEqual(password, validPassword);
    return usernameMatches && passwordMatches;
  }
}

/** Constant-time compare. Hashing makes the buffers the same length. */
function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash('sha256').update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

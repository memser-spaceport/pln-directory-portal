import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import axios from 'axios';
import { PrismaService } from '../shared/prisma.service';
import { JwtService } from '../utils/jwt/jwt.service';
import { AdminRole, hasAnyAdminRole } from '../utils/constants';

@Injectable()
export class AuthOtpService {
  private readonly baseUrl = process.env.AUTH_API_URL!;
  private readonly clientId = process.env.AUTH_APP_CLIENT_ID!;
  private readonly clientSecret = process.env.AUTH_APP_CLIENT_SECRET!;
  private readonly logger = new Logger(AuthOtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Retrieve a client_credentials token from the Auth Service.
   */
  private async getClientToken(): Promise<string> {
    try {
      const resp = await axios.post(
        `${this.baseUrl}/auth/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
      );

      return resp.data.access_token;
    } catch (e: any) {
      this.logger.error(
        'Failed to obtain client token from Auth Service',
        e?.response?.data ?? e?.message,
      );

      throw new HttpException(
        'Failed to get client token from Auth Service',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Trigger OTP sending via Auth Service for a given email.
   */
  async sendOtp(email: string): Promise<{ token: string }> {
    const clientToken = await this.getClientToken();

    const normalizedEmail = email.trim().toLowerCase();

    try {
      const resp = await axios.post(
        `${this.baseUrl}/mfa/otp`,
        {
          recipientAddress: normalizedEmail,
          notificationType: 'EMAIL',
        },
        {
          headers: {
            Authorization: `Bearer ${clientToken}`,
          },
        },
      );

      if (!resp.data?.token) {
        this.logger.error(
          'Auth Service /mfa/otp response does not contain token',
          JSON.stringify(resp.data),
        );

        throw new HttpException(
          'Auth Service did not return OTP token',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return { token: resp.data.token };
    } catch (e: any) {
      this.logger.error(
        'Failed to send OTP via Auth Service',
        e?.response?.data ?? e?.message,
      );

      throw new HttpException(
        e?.response?.data ?? 'Failed to send OTP',
        e?.response?.status ?? HttpStatus.BAD_GATEWAY,
      );
    }
  }

  /**
   * Verify OTP via Auth Service, resolve Member in directory DB,
   * check that Member can access back-office, and issue a local admin JWT.
   */
  async verifyOtp(otpToken: string, code: string): Promise<{
    authToken: string;
    refreshToken: string | null;
    user: any;
  }> {
    const clientToken = await this.getClientToken();

    let resp;
    try {
      resp = await axios.post(
        `${this.baseUrl}/mfa/otp/verify`,
        { token: otpToken, code },
        {
          headers: {
            Authorization: `Bearer ${clientToken}`,
          },
        },
      );
    } catch (e: any) {
      this.logger.warn(
        'OTP verification failed in Auth Service',
        e?.response?.data ?? e?.message,
      );

      // Bubble up status and error body from Auth Service where possible
      throw new HttpException(
        e?.response?.data ?? 'Failed to verify OTP',
        e?.response?.status ?? HttpStatus.BAD_GATEWAY,
      );
    }

    // 1) Extract email from Auth Service response
    const rawEmail =
      resp.data?.user?.email ??
      resp.data?.email ??
      resp.data?.userEmail ??
      resp.data?.recipient ??
      '';

    const email = String(rawEmail).trim().toLowerCase();

    if (!email) {
      this.logger.error(
        'Email is missing in OTP verification response from Auth Service',
        JSON.stringify(resp.data),
      );
      throw new UnauthorizedException('Email is missing in OTP response');
    }

    // 2) Look up Member by email in directory DB with their roles
    const member = await this.prisma.member.findFirst({
      where: {
        email,
        deletedAt: null,
      },
      include: {
        memberRoles: {
          select: { name: true },
        },
      },
    });

    if (!member) {
      this.logger.warn(
        `Member not found for email ${email} during OTP login`,
      );
      throw new ForbiddenException('Member not found for this email');
    }

    // 3) Check that Member has back-office access via admin roles.
    // A member can access back-office if they have DIRECTORY_ADMIN or DEMO_DAY_ADMIN role
    const backofficeRoles = [AdminRole.DIRECTORY_ADMIN, AdminRole.DEMO_DAY_ADMIN];
    const hasBackofficeAccess = hasAnyAdminRole(member, backofficeRoles);

    if (!hasBackofficeAccess) {
      this.logger.warn(`Member ${member.uid} (${email}) does not have back-office admin role`);
      throw new ForbiddenException('Member does not have back-office admin access');
    }

    // 4) Determine which roles to include in the JWT based on member's roles
    const memberRoleNames = member.memberRoles.map((r) => r.name);
    const jwtRoles = memberRoleNames.filter((role) =>
      Object.values(AdminRole).includes(role as AdminRole)
    );

    // 5) Issue a LOCAL admin JWT for directory with the member's actual admin roles
    const accessToken = await this.jwtService.getSignedToken(jwtRoles);

    return {
      authToken: accessToken,
      // Refresh token is out of scope for now, so we return null
      refreshToken: null,
      user: {
        uid: member.uid,
        email: member.email,
        name: member.name,
        roles: jwtRoles,
      },
    };
  }
}

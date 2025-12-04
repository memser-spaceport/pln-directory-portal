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

    // 2) Look up Member by email in directory DB
    const member = await this.prisma.member.findFirst({
      where: {
        email,
        deletedAt: null,
      },
    });

    if (!member) {
      this.logger.warn(
        `Member not found for email ${email} during OTP login`,
      );
      throw new ForbiddenException('Member not found for this email');
    }

    // 3) Check that Member has back-office access.
    // Preferred: dedicated flag isBackofficeAdmin
    if (!(member as any).isBackofficeAdmin) {
      // If you still rely on role, you can additionally check:
      // if (member.role !== 'DIRECTORYADMIN') { ... }
      this.logger.warn(
        `Member ${member.uid} (${email}) is not back-office admin`,
      );
      throw new ForbiddenException('Member is not back-office admin');
    }

    // 4) Issue a LOCAL admin JWT for directory.
    // We assume that getSignedToken accepts an array of roles,
    // and internally uses ADMIN_TOKEN_SECRET or equivalent.
    const accessToken = await this.jwtService.getSignedToken([
      'DIRECTORYADMIN',
    ]);

    return {
      authToken: accessToken,
      // Refresh token is out of scope for now, so we return null
      refreshToken: null,
      user: {
        uid: member.uid,
        email: member.email,
        name: member.name,
        role: member.role,
        isBackofficeAdmin: (member as any).isBackofficeAdmin ?? false,
      },
    };
  }
}

import { Injectable, BadRequestException, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import axios from 'axios';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import {
  LinkedInAuthUrlRequestDto,
  LinkedInCallbackRequestDto,
  LinkedInVerificationResponseDto,
  LinkedInVerificationStatusDto,
} from 'libs/contracts/src/schema/linkedin-verification';
import { AccessLevel } from '../../../../libs/contracts/src/schema/admin-member';
import path from 'path';
import { AwsService } from '../utils/aws/aws.service';
import { Member } from '@prisma/client';
import { MemberService } from '../admin/member.service';

@Injectable()
export class LinkedInVerificationService implements OnModuleDestroy {
  private readonly clientId = process.env.LINKEDIN_CLIENT_ID;
  private readonly clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  private readonly redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  private readonly CACHE_TTL = 3600;
  private readonly adminEmails: string[];
  private redis: Redis;

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService,
    private readonly memberService: MemberService,
    private awsService: AwsService
  ) {
    this.redis = new Redis(process.env.REDIS_CACHE_URL as string, {
      ...(process.env.REDIS_CACHE_TLS && {
        tls: {
          rejectUnauthorized: false,
        },
      }),
    });
    this.adminEmails = this.getAdminEmails();
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  async getLinkedInAuthUrl(request: LinkedInAuthUrlRequestDto): Promise<{ authUrl: string; state: string }> {
    if (!this.clientId || !this.redirectUri) {
      throw new BadRequestException('LinkedIn configuration is missing');
    }

    // Verify member exists
    const member = await this.prisma.member.findUnique({
      where: { uid: request.memberUid },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const scope = 'openid profile email';
    const state = Math.random().toString(36).substring(7);

    // Store auth data in Redis cache with state as key
    const authData = {
      memberUid: request.memberUid,
      redirectUrl: request.redirectUrl || `${process.env.WEB_UI_BASE_URL}/profile`,
      timestamp: Date.now(),
    };

    await this.redis.set(`linkedin_auth:${state}`, JSON.stringify(authData), 'EX', this.CACHE_TTL);

    // Build auth URL with parameters to prevent Safari issues
    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
      this.clientId
    }&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}&scope=${encodeURIComponent(
      scope
    )}&prompt=consent&auth_type=rerequest`;

    return { authUrl, state };
  }

  async handleLinkedInCallback(request: LinkedInCallbackRequestDto): Promise<LinkedInVerificationResponseDto> {
    this.logger.info(`LinkedIn callback received for member ${request.state}`, 'LinkedInVerification');

    // Retrieve auth data from Redis cache
    const authDataString = await this.redis.get(`linkedin_auth:${request.state}`);

    if (!authDataString) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    const authData = JSON.parse(authDataString) as { memberUid: string; redirectUrl: string; timestamp: number };
    const { memberUid, redirectUrl = `${process.env.WEB_UI_BASE_URL}/profile` } = authData;

    // Log callback attempt for debugging mobile Safari issues
    this.logger.info(
      `LinkedIn callback received for member ${memberUid}, state: ${request.state}`,
      'LinkedInVerification'
    );

    try {
      if (!request.code) {
        throw new BadRequestException('Authorization code is required');
      }

      if (!request.state) {
        throw new BadRequestException('State parameter is required');
      }

      // Clean up the cache entry
      await this.redis.del(`linkedin_auth:${request.state}`);

      // Get access token - use the same redirect URI that was used in the authorization request
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
        params: {
          grant_type: 'authorization_code',
          code: request.code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri, // Always use the main redirect URI for token exchange
        },
      });

      const { access_token } = tokenResponse.data;

      if (!access_token) {
        throw new BadRequestException('Failed to obtain access token');
      }

      const profileResponse = await axios.get('https://api.linkedin.com/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      });

      const profileData = profileResponse.data;

      // Find member by memberUid from cache
      const member = await this.prisma.member.findUnique({
        where: { uid: memberUid },
        include: {
          linkedinProfile: true,
        },
      });

      if (!member) {
        throw new BadRequestException('Member not found');
      }

      // Additional security: Check if this LinkedIn profile is already connected to another member
      const existingLinkedInProfile = await this.prisma.linkedInProfile.findUnique({
        where: {
          linkedinProfileId: profileData.sub,
        },
      });

      if (existingLinkedInProfile && existingLinkedInProfile.memberUid !== member.uid) {
        throw new BadRequestException('This LinkedIn profile is already connected to another member account.');
      }

      // Update or create LinkedIn profile
      const linkedinProfile = await this.prisma.linkedInProfile.upsert({
        where: {
          memberUid: member.uid,
        },
        update: {
          linkedinProfileId: profileData.sub,
          profileData: profileData,
          isVerified: true,
          verifiedAt: new Date(),
        },
        create: {
          memberUid: member.uid,
          linkedinProfileId: profileData.sub,
          profileData: profileData,
          isVerified: true,
          verifiedAt: new Date(),
        },
      });

      // Update member's linkedinHandler if not set
      if (!member.linkedinHandler) {
        await this.prisma.member.update({
          where: { uid: member.uid },
          data: {
            linkedinHandler: linkedinProfile.linkedinHandler,
          },
        });
      }

      let accessLevel = member.accessLevel;
      if (member.accessLevel === AccessLevel.L0) {
        const result = await this.memberService.updateAccessLevel({
          memberUids: [member.uid],
          accessLevel: AccessLevel.L1,
        });
        if (result.updatedCount > 0) {
          accessLevel = AccessLevel.L1;
          const emailData = await this.prepareEmailTemplateData(member);
          await this.sendLinkedinVerifiedEmailToAdmin(emailData, `New Member LinkedIn Verified : ${member.name}`);
        }
      }

      this.logger.info(`LinkedIn verification completed for member ${member.uid}`, 'LinkedInVerification');

      return {
        success: true,
        message: 'LinkedIn profile verified successfully',
        linkedinProfileId: linkedinProfile.linkedinProfileId,
        linkedinHandler: linkedinProfile.linkedinHandler || undefined,
        profileData: linkedinProfile.profileData as any,
        redirectUrl: `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}status=success&accesslevel=${accessLevel}`,
        newAccessLevel: accessLevel,
      };
    } catch (error) {
      this.logger.error('LinkedIn verification failed', error, 'LinkedInVerification');
      let errorMessage = 'LinkedIn verification failed. Please try again.';

      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        errorMessage = error.message || errorMessage;
      }

      return {
        success: false,
        message: errorMessage,
        redirectUrl: `${redirectUrl}${
          redirectUrl.includes('?') ? '&' : '?'
        }status=error&error_message=${encodeURIComponent(errorMessage)}`,
        newAccessLevel: null,
      };
    }
  }

  async getLinkedInVerificationStatus(memberUid: string): Promise<LinkedInVerificationStatusDto> {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      include: {
        linkedinProfile: true,
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    return {
      verified: member.linkedinProfile?.isVerified || false,
      linkedinHandler: member.linkedinHandler || undefined,
      linkedinProfile: member.linkedinProfile
        ? {
            uid: member.linkedinProfile.uid,
            memberUid: member.linkedinProfile.memberUid,
            linkedinProfileId: member.linkedinProfile.linkedinProfileId,
            linkedinHandler: member.linkedinProfile.linkedinHandler,
            profileData: member.linkedinProfile.profileData as any,
            isVerified: member.linkedinProfile.isVerified,
            verifiedAt: member.linkedinProfile.verifiedAt?.toISOString() || null,
            createdAt: member.linkedinProfile.createdAt.toISOString(),
            updatedAt: member.linkedinProfile.updatedAt.toISOString(),
          }
        : undefined,
    };
  }

  private async sendLinkedinVerifiedEmailToAdmin(emailData: any, subject: string): Promise<void> {
    const result = await this.awsService.sendEmailWithTemplate(
      path.join(__dirname, '/shared/linkedinVerifiedAdmin.hbs'),
      emailData,
      '',
      subject,
      process.env.SES_SOURCE_EMAIL || '',
      this.adminEmails,
      [],
      undefined,
      true
    );

    this.logger.info(`Admin email sent to ${this.adminEmails} ref: ${result?.MessageId}`);
  }

  private getAdminEmails(): string[] {
    const adminEmailIdsFromEnv = process.env.SES_ADMIN_EMAIL_IDS;
    return adminEmailIdsFromEnv?.split('|') ?? [];
  }

  private async prepareEmailTemplateData(member: Member): Promise<{
    adminName: string;
    targetName: string;
    targetEmail: string | null;
    otherUsers: Array<{
      name: string;
      email: string | null;
    }>;
    backofficeReference: string | undefined;
  }> {
    const pendingMembers = await this.prisma.member.findMany({
      where: {
        accessLevel: 'L1',
        uid: {
          not: member.uid,
        },
      },
      select: {
        name: true,
        email: true,
      },
      take: 3,
    });

    return {
      adminName: 'Directory Admin',
      targetName: member.name,
      targetEmail: member.email,
      otherUsers: pendingMembers.map((user) => ({
        name: user.name,
        email: user.email,
        link: `${process.env.WEB_ADMIN_UI_BASE_URL}/members?filter=level1&search=${user.email}`,
      })),
      backofficeReference: process.env.WEB_ADMIN_UI_BASE_URL,
    };
  }
}

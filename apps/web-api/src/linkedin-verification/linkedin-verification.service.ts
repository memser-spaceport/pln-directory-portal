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

@Injectable()
export class LinkedInVerificationService implements OnModuleDestroy {
  private readonly clientId = process.env.LINKEDIN_CLIENT_ID;
  private readonly clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  private readonly redirectUri = process.env.LINKEDIN_REDIRECT_URI;
  private readonly CACHE_TTL = 3600;
  private redis: Redis;

  constructor(private readonly prisma: PrismaService, private readonly logger: LogService) {
    this.redis = new Redis(process.env.REDIS_CACHE_URL as string, {
      ...(process.env.REDIS_CACHE_TLS && {
        tls: {
          rejectUnauthorized: false,
        },
      }),
    });
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

    const authUrl = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${
      this.clientId
    }&redirect_uri=${encodeURIComponent(this.redirectUri)}&state=${state}&scope=${encodeURIComponent(scope)}`;

    return { authUrl, state };
  }

  async handleLinkedInCallback(request: LinkedInCallbackRequestDto): Promise<LinkedInVerificationResponseDto> {
    // Retrieve auth data from Redis cache
    const authDataString = await this.redis.get(`linkedin_auth:${request.state}`);

    if (!authDataString) {
      throw new BadRequestException('Invalid or expired state parameter');
    }

    const authData = JSON.parse(authDataString) as { memberUid: string; redirectUrl: string; timestamp: number };
    const { memberUid, redirectUrl = `${process.env.WEB_UI_BASE_URL}/profile` } = authData;

    try {
      if (!request.code) {
        throw new BadRequestException('Authorization code is required');
      }

      if (!request.state) {
        throw new BadRequestException('State parameter is required');
      }

      // Clean up the cache entry
      await this.redis.del(`linkedin_auth:${request.state}`);

      // Get access token
      const tokenResponse = await axios.post('https://www.linkedin.com/oauth/v2/accessToken', null, {
        params: {
          grant_type: 'authorization_code',
          code: request.code,
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: this.redirectUri,
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

      this.logger.info(`LinkedIn verification completed for member ${member.uid}`, 'LinkedInVerification');

      return {
        success: true,
        message: 'LinkedIn profile verified successfully',
        linkedinProfileId: linkedinProfile.linkedinProfileId,
        linkedinHandler: linkedinProfile.linkedinHandler || undefined,
        profileData: linkedinProfile.profileData as any,
        redirectUrl: `${redirectUrl}${redirectUrl.includes('?') ? '&' : '?'}status=success`,
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
}

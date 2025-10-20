import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { DemoDayFundraisingProfilesService } from '../demo-days/demo-day-fundraising-profiles.service';
import { UploadsService } from '../uploads/uploads.service';
import { AwsService } from '../utils/aws/aws.service';
import { UploadKind } from '@prisma/client';

@Injectable()
export class DemoDaysAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayFundraisingProfilesService: DemoDayFundraisingProfilesService,
    private readonly uploadsService: UploadsService,
    private readonly awsService: AwsService
  ) {}

  async getCurrentDemoDayFundraisingProfiles(
    params?: {
      stage?: string[];
      industry?: string[];
      search?: string;
    },
    userId?: string
  ): Promise<any[]> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Build where clause without status/upload restrictions
    const where: any = {
      demoDayUid: demoDay.uid,
    };

    if (params?.stage || params?.industry || params?.search) {
      where.team = { ...(where.team || {}) };

      // filter by funding stage
      if (params.stage) {
        if (Array.isArray(params.stage)) {
          where.team.fundingStageUid = { in: params.stage };
        } else {
          where.team.fundingStageUid = params.stage;
        }
      }

      // filter by industry tag
      if (params.industry) {
        if (Array.isArray(params.industry)) {
          where.team.industryTags = { some: { uid: { in: params.industry } } };
        } else {
          where.team.industryTags = { some: { uid: params.industry } };
        }
      }

      if (params.search) {
        where.team.name = { contains: params.search, mode: 'insensitive' };
      }
    }

    // Fetch all profiles without restrictions using the existing service method
    return this.fetchProfiles(where, demoDay.uid, userId);
  }

  async updateFundraisingOnePager(teamUid: string, onePagerUploadUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Validate upload
    if (onePagerUploadUid) {
      const upload = await this.prisma.upload.findUnique({
        where: { uid: onePagerUploadUid },
      });
      if (!upload || (upload.kind !== 'IMAGE' && upload.kind !== 'SLIDE')) {
        throw new ForbiddenException('Invalid one-pager upload');
      }
    }

    // Update or create profile
    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        onePagerUploadUid,
      },
      create: {
        teamUid: teamUid,
        demoDayUid: demoDay.uid,
        onePagerUploadUid,
        status: 'DRAFT',
      },
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async deleteFundraisingOnePager(teamUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      include: {
        onePagerUpload: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Team fundraising profile not found');
    }

    if (profile.onePagerUpload) {
      // Delete from S3 and database (assuming UploadsService handles this)
      // For now, just remove the reference
      await this.prisma.teamFundraisingProfile.update({
        where: {
          teamUid_demoDayUid: {
            teamUid: teamUid,
            demoDayUid: demoDay.uid,
          },
        },
        data: {
          onePagerUploadUid: null,
        },
      });
    }

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingDescription(teamUid: string, description: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Update or create profile
    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        description,
      },
      create: {
        teamUid: teamUid,
        demoDayUid: demoDay.uid,
        description,
        status: 'DRAFT',
      },
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingVideo(teamUid: string, videoUploadUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Validate upload
    if (videoUploadUid) {
      const upload = await this.prisma.upload.findUnique({
        where: { uid: videoUploadUid },
      });
      if (!upload || upload.kind !== 'VIDEO') {
        throw new ForbiddenException('Invalid video upload');
      }
    }

    // Update or create profile
    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        videoUploadUid,
      },
      create: {
        teamUid: teamUid,
        demoDayUid: demoDay.uid,
        videoUploadUid,
        status: 'DRAFT',
      },
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async deleteFundraisingVideo(teamUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      include: {
        videoUpload: true,
      },
    });

    if (!profile) {
      throw new NotFoundException('Team fundraising profile not found');
    }

    if (profile.videoUpload) {
      // Delete from S3 and database (assuming UploadsService handles this)
      // For now, just remove the reference
      await this.prisma.teamFundraisingProfile.update({
        where: {
          teamUid_demoDayUid: {
            teamUid: teamUid,
            demoDayUid: demoDay.uid,
          },
        },
        data: {
          videoUploadUid: null,
        },
      });
    }

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingTeam(
    teamUid: string,
    data: {
      name?: string;
      shortDescription?: string;
      industryTags?: string[];
      fundingStage?: string;
      logo?: string;
    }
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Verify the team exists and has a fundraising profile for the current demo day
    const team = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      include: {
        fundraisingProfiles: {
          where: { demoDayUid: demoDay.uid },
        },
      },
    });

    if (!team) {
      throw new NotFoundException('Team not found');
    }

    if (team.fundraisingProfiles.length === 0) {
      throw new ForbiddenException('Team does not have a fundraising profile for the current demo day');
    }

    const updateData = this.buildUpdateData(data);

    // Update team
    await this.prisma.team.update({
      where: { uid: teamUid },
      data: updateData,
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  private buildUpdateData(data: any): any {
    const updateData: any = {};

    if (data.name) {
      updateData.name = data.name;
    }

    if (data.shortDescription) {
      updateData.shortDescription = data.shortDescription;
    }

    if (data.logo) {
      updateData.logoUid = data.logo;
    }

    if (data.fundingStage) {
      updateData.fundingStageUid = data.fundingStage;
    }

    if (data.industryTags) {
      updateData.industryTags = {
        set: data.industryTags.map((uid: any) => ({ uid })),
      };
    }

    return updateData;
  }

  private async fetchProfiles(where: any, demoDayUid: string, userId?: string): Promise<any[]> {
    const [profiles, founders] = await Promise.all([
      this.prisma.teamFundraisingProfile.findMany({
        where,
        include: {
          team: {
            select: {
              uid: true,
              name: true,
              shortDescription: true,
              industryTags: {
                select: {
                  uid: true,
                  title: true,
                },
              },
              fundingStage: {
                select: {
                  uid: true,
                  title: true,
                },
              },
              logo: {
                select: {
                  uid: true,
                  url: true,
                },
              },
            },
          },
          onePagerUpload: true,
          videoUpload: true,
        },
      }),
      this.prisma.demoDayParticipant.findMany({
        where: {
          demoDayUid: demoDayUid,
          status: 'ENABLED',
          type: 'FOUNDER',
          isDeleted: false,
        },
        include: {
          member: {
            select: {
              uid: true,
              name: true,
              email: true,
              image: {
                select: {
                  uid: true,
                  url: true,
                },
              },
              officeHours: true,
              skills: {
                select: {
                  uid: true,
                  title: true,
                },
              },
              teamMemberRoles: {
                select: {
                  role: true,
                  teamUid: true,
                },
              },
            },
          },
        },
      }),
    ]);

    // Group founders by teamUid
    const foundersByTeam = founders.reduce((acc, participant) => {
      const teamUid = participant.teamUid;
      if (!teamUid) return acc; // Skip if teamUid is null

      if (!acc[teamUid]) {
        acc[teamUid] = [];
      }

      // Find the role for this specific team
      const teamRole = participant.member.teamMemberRoles.find((role) => role.teamUid === teamUid);

      acc[teamUid].push({
        uid: participant.member.uid,
        name: participant.member.name,
        email: participant.member.email,
        image: participant.member.image,
        role: teamRole?.role || null,
        skills: participant.member.skills,
        officeHours: participant.member.officeHours,
      });

      return acc;
    }, {} as Record<string, any[]>);

    // Add founders to each profile
    const profilesWithFounders = profiles
      .map((profile) => ({
        ...profile,
        founders: foundersByTeam[profile.teamUid] || [],
      }))
      .filter((profile) => profile.founders.length > 0);

    if (userId && profilesWithFounders.length > 0) {
      const interests = await this.prisma.demoDayExpressInterestStatistic.findMany({
        where: {
          demoDayUid: demoDayUid,
          memberUid: userId,
          teamFundraisingProfileUid: { in: profilesWithFounders.map((p) => p.uid) },
          isPrepDemoDay: true,
        },
        select: {
          teamFundraisingProfileUid: true,
          liked: true,
          connected: true,
          invested: true,
          referral: true,
        },
      });

      const byProfile = interests.reduce((acc, it) => {
        acc[it.teamFundraisingProfileUid] = {
          liked: !!it.liked,
          connected: !!it.connected,
          invested: !!it.invested,
          referral: !!it.referral,
        };
        return acc;
      }, {} as Record<string, { liked: boolean; connected: boolean; invested: boolean; referral: boolean }>);

      for (const p of profilesWithFounders) {
        const f = byProfile[p.uid] || { liked: false, connected: false, invested: false, referral: false };
        (p as any).liked = f.liked;
        (p as any).connected = f.connected;
        (p as any).invested = f.invested;
        (p as any).referral = f.referral;
      }
    }

    if (userId) {
      return this.sortProfilesForUser(userId, profilesWithFounders);
    }

    return profilesWithFounders;
  }

  private sortProfilesForUser(userSeed: string, profiles: any[]): any[] {
    const hash = (s: string): number => {
      // Simple FNV-1a 32-bit hash
      let h = 0x811c9dc5;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h * 0x01000193) >>> 0;
      }
      return h >>> 0;
    };

    const seed = userSeed || '';
    return profiles
      .map((p) => ({ key: hash(`${seed}|${p.teamUid}`), p }))
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
      .map(({ p }) => p);
  }

  async checkViewOnlyAccess(memberUid: string): Promise<boolean> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      return false;
    }

    const participant = await this.prisma.demoDayParticipant.findFirst({
      where: {
        demoDayUid: demoDay.uid,
        memberUid: memberUid,
        status: 'ENABLED',
        isDeleted: false,
      },
    });

    return participant?.isDemoDayAdmin || participant?.type === 'FOUNDER' || false;
  }

  async generateVideoUploadUrl(
    teamUid: string,
    filename: string,
    filesize: number,
    mimetype: string
  ): Promise<{ uploadUid: string; presignedUrl: string; s3Key: string; expiresAt: string }> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const validVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!validVideoTypes.includes(mimetype)) {
      throw new BadRequestException('Invalid video type. Allowed: mp4, webm, mov');
    }

    const maxSize = 500 * 1024 * 1024; // 500MB
    if (filesize > maxSize) {
      throw new BadRequestException('File too large. Max size is 500MB');
    }

    const fileExt = filename.split('.').pop() || '';
    const hashedFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const s3Key = `uploads/none/none/video/${hashedFilename}.${fileExt}`;

    const bucket = process.env.AWS_S3_UPLOAD_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) {
      throw new BadRequestException('S3 bucket not configured');
    }

    const upload = await this.uploadsService.createPendingUpload({
      kind: UploadKind.VIDEO,
      scopeType: 'NONE',
      scopeUid: null,
      uploaderUid: null,
      filename,
      mimetype,
      size: filesize,
      bucket,
      key: s3Key,
    });

    const presignedUrl = await this.awsService.generatePresignedPutUrl(bucket, s3Key, mimetype, 900);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      uploadUid: upload.uid,
      presignedUrl,
      s3Key,
      expiresAt,
    };
  }

  async confirmVideoUpload(teamUid: string, uploadUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const upload = await this.prisma.upload.findUnique({
      where: { uid: uploadUid },
    });

    if (!upload) {
      throw new BadRequestException('Upload not found');
    }

    const confirmedUpload = await this.uploadsService.confirmUpload(uploadUid);

    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        videoUploadUid: confirmedUpload.uid,
      },
      create: {
        teamUid: teamUid,
        demoDayUid: demoDay.uid,
        videoUploadUid: confirmedUpload.uid,
        status: 'DRAFT',
      },
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);

    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async generateOnePagerUploadUrl(
    teamUid: string,
    filename: string,
    filesize: number,
    mimetype: string
  ): Promise<{ uploadUid: string; presignedUrl: string; s3Key: string; expiresAt: string }> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const validOnePagerTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!validOnePagerTypes.includes(mimetype)) {
      throw new BadRequestException('Invalid one-pager type. Allowed: pdf, jpg, png, webp');
    }

    const maxSize = 25 * 1024 * 1024; // 25MB
    if (filesize > maxSize) {
      throw new BadRequestException('File too large. Max size is 25MB');
    }

    const fileExt = filename.split('.').pop() || '';
    const hashedFilename = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
    const s3Key = `uploads/none/none/slide/${hashedFilename}.${fileExt}`;

    const bucket = process.env.AWS_S3_UPLOAD_BUCKET_NAME || process.env.AWS_S3_BUCKET_NAME;
    if (!bucket) {
      throw new BadRequestException('S3 bucket not configured');
    }

    const upload = await this.uploadsService.createPendingUpload({
      kind: UploadKind.SLIDE,
      scopeType: 'NONE',
      scopeUid: null,
      uploaderUid: null,
      filename,
      mimetype,
      size: filesize,
      bucket,
      key: s3Key,
    });

    const presignedUrl = await this.awsService.generatePresignedPutUrl(bucket, s3Key, mimetype, 900);

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    return {
      uploadUid: upload.uid,
      presignedUrl,
      s3Key,
      expiresAt,
    };
  }

  async confirmOnePagerUpload(teamUid: string, uploadUid: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const upload = await this.prisma.upload.findUnique({
      where: { uid: uploadUid },
    });

    if (!upload) {
      throw new BadRequestException('Upload not found');
    }

    const confirmedUpload = await this.uploadsService.confirmUpload(uploadUid);

    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        onePagerUploadUid: confirmedUpload.uid,
      },
      create: {
        teamUid: teamUid,
        demoDayUid: demoDay.uid,
        onePagerUploadUid: confirmedUpload.uid,
        status: 'DRAFT',
      },
    });

    await this.demoDayFundraisingProfilesService.updateFundraisingProfileStatus(teamUid, demoDay.uid);

    return this.demoDayFundraisingProfilesService.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }
}

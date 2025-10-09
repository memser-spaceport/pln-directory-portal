import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from '../demo-days/demo-days.service';
import { DemoDayFundraisingProfilesService } from '../demo-days/demo-day-fundraising-profiles.service';

@Injectable()
export class DemoDaysAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoDaysService: DemoDaysService,
    private readonly demoDayFundraisingProfilesService: DemoDayFundraisingProfilesService
  ) {}

  async getCurrentDemoDayFundraisingProfiles(params?: {
    stage?: string[];
    industry?: string[];
    search?: string;
  }): Promise<any[]> {
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
    return this.fetchProfiles(where, demoDay.uid);
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

  private async fetchProfiles(where: any, demoDayUid: string): Promise<any[]> {
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
    return profiles
      .map((profile) => ({
        ...profile,
        founders: foundersByTeam[profile.teamUid] || [],
      }))
      .filter((profile) => profile.founders.length > 0);
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
}

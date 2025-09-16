import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DemoDay, UploadKind } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';

@Injectable()
export class DemoDayFundraisingProfilesService {
  constructor(private readonly prisma: PrismaService, private readonly demoDaysService: DemoDaysService) {}

  async getCurrentDemoDayFundraisingProfile(memberEmail: string): Promise<any> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    // Get member and check if they are an enabled founder participant
    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      include: {
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
            status: 'ENABLED',
            type: 'FOUNDER',
          },
          take: 1,
        },
        teamMemberRoles: {
          include: { team: true },
        },
      },
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('No demo day access');
    }

    const demoDayParticipant = member.demoDayParticipants[0];
    const teamUid =
      demoDayParticipant.teamUid ||
      member.teamMemberRoles.find((role) => role.mainTeam)?.team.uid ||
      member.teamMemberRoles[0].team.uid;

    if (!teamUid) {
      throw new BadRequestException('Member must be part of a team to access fundraising profile');
    }

    // Get team details with required fields
    const teamWithDetails = await this.prisma.team.findUnique({
      where: { uid: teamUid },
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
    });

    // Get or create fundraising profile
    let fundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      include: {
        onePagerUpload: true,
        videoUpload: true,
      },
    });

    if (!fundraisingProfile) {
      fundraisingProfile = await this.prisma.teamFundraisingProfile.create({
        data: {
          teamUid: teamUid,
          demoDayUid: demoDay.uid,
          status: 'DRAFT',
        },
        include: {
          onePagerUpload: true,
          videoUpload: true,
        },
      });
    }

    // If teamUid is not set, set it
    if (!demoDayParticipant.teamUid) {
      await this.prisma.demoDayParticipant.update({
        where: { uid: demoDayParticipant.uid },
        data: { teamUid: teamUid },
      });
    }

    // Get all enabled founders for this team with their roles
    const founders = await this.prisma.demoDayParticipant.findMany({
      where: {
        demoDayUid: demoDay.uid,
        teamUid: teamUid,
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
              where: {
                teamUid: teamUid,
              },
              select: {
                role: true,
              },
            },
          },
        },
      },
    });

    // Format founders data
    const foundersWithRoles = founders.map((participant) => ({
      uid: participant.member.uid,
      name: participant.member.name,
      email: participant.member.email,
      image: participant.member.image,
      role: participant.member.teamMemberRoles[0]?.role || null,
      skills: participant.member.skills,
      officeHours: participant.member.officeHours,
    }));

    return {
      uid: fundraisingProfile.uid,
      teamUid: teamUid,
      team: teamWithDetails,
      founders: foundersWithRoles,
      onePagerUploadUid: fundraisingProfile.onePagerUploadUid,
      onePagerUpload: fundraisingProfile.onePagerUpload,
      videoUploadUid: fundraisingProfile.videoUploadUid,
      videoUpload: fundraisingProfile.videoUpload,
    };
  }

  private async validateDemoDayFounderAccess(
    memberEmail: string
  ): Promise<{ member: any; team: any; demoDay: DemoDay }> {
    const demoDay = await this.demoDaysService.getCurrentDemoDay();
    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      include: {
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
            status: 'ENABLED',
            type: 'FOUNDER',
          },
          take: 1,
        },
        teamMemberRoles: {
          include: { team: true },
        },
      },
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('No demo day access');
    }

    const demoDayParticipant = member.demoDayParticipants[0];
    const teamMemberRole = demoDayParticipant.teamUid
      ? member.teamMemberRoles.find((role) => role.teamUid === demoDayParticipant.teamUid)
      : member.teamMemberRoles.find((role) => role.mainTeam);
    const team = teamMemberRole ? teamMemberRole.team : member.teamMemberRoles[0].team;

    if (!team) {
      throw new BadRequestException('Member must be part of a team to access fundraising profile');
    }

    return { member, team, demoDay };
  }

  private async updateFundraisingProfileStatus(teamUid: string, demoDayUid: string): Promise<void> {
    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid,
          demoDayUid,
        },
      },
      include: {
        team: {
          select: {
            name: true,
            shortDescription: true,
            industryTags: true,
            fundingStage: true,
            logo: true,
          },
        },
      },
    });

    if (!profile) return;

    // Check if all required fields are provided
    const hasAllFields =
      profile.team.name &&
      profile.team.shortDescription &&
      profile.team.industryTags.length > 0 &&
      profile.team.fundingStage &&
      profile.team.logo &&
      profile.onePagerUploadUid &&
      profile.videoUploadUid;

    const newStatus = hasAllFields ? 'PUBLISHED' : 'DRAFT';

    await this.prisma.teamFundraisingProfile.update({
      where: {
        teamUid_demoDayUid: {
          teamUid,
          demoDayUid,
        },
      },
      data: {
        status: newStatus,
        lastModifiedBy: profile.lastModifiedBy,
      },
    });
  }

  async updateFundraisingOnePager(memberEmail: string, onePagerUploadUid: string): Promise<any> {
    const { team, demoDay } = await this.validateDemoDayFounderAccess(memberEmail);

    // Validate upload
    if (onePagerUploadUid) {
      const upload = await this.prisma.upload.findUnique({
        where: { uid: onePagerUploadUid },
      });
      if (!upload || (upload.kind !== UploadKind.IMAGE && upload.kind !== UploadKind.SLIDE)) {
        throw new BadRequestException('Invalid one-pager upload');
      }
    }

    // Update or create profile
    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: team.uid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        onePagerUploadUid,
      },
      create: {
        teamUid: team.uid,
        demoDayUid: demoDay.uid,
        onePagerUploadUid,
        status: 'DRAFT',
      },
    });

    await this.updateFundraisingProfileStatus(team.uid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfile(memberEmail);
  }

  async deleteFundraisingOnePager(memberEmail: string): Promise<any> {
    const { team, demoDay } = await this.validateDemoDayFounderAccess(memberEmail);

    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: team.uid,
          demoDayUid: demoDay.uid,
        },
      },
      include: {
        onePagerUpload: true,
      },
    });

    if (profile?.onePagerUpload) {
      // Delete from S3 and database (assuming UploadsService handles this)
      // For now, just remove the reference
      await this.prisma.teamFundraisingProfile.update({
        where: {
          teamUid_demoDayUid: {
            teamUid: team.uid,
            demoDayUid: demoDay.uid,
          },
        },
        data: {
          onePagerUploadUid: null,
        },
      });
    }

    await this.updateFundraisingProfileStatus(team.uid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfile(memberEmail);
  }

  async updateFundraisingVideo(memberEmail: string, videoUploadUid: string): Promise<any> {
    const { team, demoDay } = await this.validateDemoDayFounderAccess(memberEmail);

    // Validate upload
    if (videoUploadUid) {
      const upload = await this.prisma.upload.findUnique({
        where: { uid: videoUploadUid },
      });
      if (!upload || upload.kind !== UploadKind.VIDEO) {
        throw new BadRequestException('Invalid video upload');
      }
    }

    // Update or create profile
    await this.prisma.teamFundraisingProfile.upsert({
      where: {
        teamUid_demoDayUid: {
          teamUid: team.uid,
          demoDayUid: demoDay.uid,
        },
      },
      update: {
        videoUploadUid,
      },
      create: {
        teamUid: team.uid,
        demoDayUid: demoDay.uid,
        videoUploadUid,
        status: 'DRAFT',
      },
    });

    await this.updateFundraisingProfileStatus(team.uid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfile(memberEmail);
  }

  async deleteFundraisingVideo(memberEmail: string): Promise<any> {
    const { team, demoDay } = await this.validateDemoDayFounderAccess(memberEmail);

    const profile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: team.uid,
          demoDayUid: demoDay.uid,
        },
      },
      include: {
        videoUpload: true,
      },
    });

    if (profile?.videoUpload) {
      // Delete from S3 and database (assuming UploadsService handles this)
      // For now, just remove the reference
      await this.prisma.teamFundraisingProfile.update({
        where: {
          teamUid_demoDayUid: {
            teamUid: team.uid,
            demoDayUid: demoDay.uid,
          },
        },
        data: {
          videoUploadUid: null,
        },
      });
    }

    await this.updateFundraisingProfileStatus(team.uid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfile(memberEmail);
  }

  async updateFundraisingTeam(
    memberEmail: string,
    data: {
      name?: string;
      shortDescription?: string;
      industryTags?: string[];
      fundingStage?: string;
      logo?: string;
    }
  ): Promise<any> {
    const { team, demoDay } = await this.validateDemoDayFounderAccess(memberEmail);

    const updateData: any = {};

    if (data.name !== undefined) {
      updateData.name = data.name;
    }
    if (data.shortDescription !== undefined) {
      updateData.shortDescription = data.shortDescription;
    }
    if (data.logo !== undefined) {
      updateData.logoUid = data.logo;
    }
    if (data.fundingStage !== undefined) {
      updateData.fundingStageUid = data.fundingStage;
    }
    if (data.industryTags !== undefined) {
      updateData.industryTags = {
        set: data.industryTags.map((uid) => ({ uid })),
      };
    }

    // Update team
    await this.prisma.team.update({
      where: { uid: team.uid },
      data: updateData,
    });

    await this.updateFundraisingProfileStatus(team.uid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfile(memberEmail);
  }
}

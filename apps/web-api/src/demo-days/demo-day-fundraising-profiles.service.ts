import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { TeamFundraisingProfile, Upload, UploadKind } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { UploadsService } from '../uploads/uploads.service';
import { AwsService } from '../utils/aws/aws.service';

@Injectable()
export class DemoDayFundraisingProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoDaysService: DemoDaysService,
    private readonly analyticsService: AnalyticsService,
    private readonly uploadsService: UploadsService,
    private readonly awsService: AwsService
  ) {}

  async getCurrentDemoDayFundraisingProfileByTeamUid(teamUid: string, demoDayUid: string): Promise<any> {
    // Get team details with required fields
    const teamWithDetails = await this.prisma.team.findUnique({
      where: { uid: teamUid },
      select: {
        uid: true,
        name: true,
        shortDescription: true,
        website: true,
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
          demoDayUid: demoDayUid,
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
          demoDayUid: demoDayUid,
          status: 'DRAFT',
        },
        include: {
          onePagerUpload: true,
          videoUpload: true,
        },
      });
    }

    // Get all enabled founders for this team with their roles
    const founders = await this.prisma.demoDayParticipant.findMany({
      where: {
        demoDayUid: demoDayUid,
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
      description: fundraisingProfile.description,
    };
  }

  async getCurrentDemoDayFundraisingProfile(memberEmail: string, demoDayUidOrSlug: string): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
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
      member.teamMemberRoles[0]?.team.uid;

    if (!teamUid) {
      throw new BadRequestException('Member must be part of a team to access fundraising profile');
    }

    // If teamUid is not set, set it
    if (!demoDayParticipant.teamUid) {
      await this.prisma.demoDayParticipant.update({
        where: { uid: demoDayParticipant.uid },
        data: { teamUid: teamUid },
      });
    }

    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  /**
   * Validates if a non-admin user has founder access to the specified team
   * @param memberEmail - Email of the member to validate
   * @param teamUid - UID of the team to validate access for
   * @param demoDayUid - UID of the demo day
   * @throws ForbiddenException if user doesn't have access
   */
  private async validateTeamFounderAccess(memberEmail: string, teamUid: string, demoDayUid: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      include: {
        demoDayParticipants: {
          where: {
            demoDayUid: demoDayUid,
            teamUid: teamUid,
            isDeleted: false,
            status: 'ENABLED',
            type: 'FOUNDER',
          },
          take: 1,
        },
      },
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('No demo day access');
    }
  }

  async updateFundraisingProfileStatus(teamUid: string, demoDayUid: string): Promise<void> {
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

    // Check if required materials exist
    const hasMaterials = Boolean(profile.onePagerUploadUid && profile.videoUploadUid);
    const newStatus = profile.team.name && hasMaterials ? 'PUBLISHED' : 'DRAFT';

    // Remember previous status to detect transition
    const prevStatus = profile.status;

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

    // Check "at least one ENABLED FOUNDER has access" condition
    const foundersCount = await this.prisma.demoDayParticipant.count({
      where: {
        demoDayUid,
        teamUid,
        isDeleted: false,
        status: 'ENABLED',
        type: 'FOUNDER',
      },
    });

    // Determine whether profile "qualifies" for being listed in Demo Day
    const qualifiesNow = newStatus === 'PUBLISHED' && hasMaterials && foundersCount > 0;
    const qualifiedBefore =
      prevStatus === 'PUBLISHED' && Boolean(profile.onePagerUploadUid && profile.videoUploadUid) && foundersCount > 0;

    // Fire analytics events on transition edges only
    if (!qualifiedBefore && qualifiesNow) {
      // Team Fundraising Profile added to demo day
      await this.analyticsService.trackEvent({
        name: 'demo-day-team-profile-added',
        distinctId: teamUid,
        properties: {
          teamUid,
          demoDayUid,
          profileUid: profile.uid,
          status: newStatus,
          foundersCount,
          hasOnePager: Boolean(profile.onePagerUploadUid),
          hasVideo: Boolean(profile.videoUploadUid),
        },
      });
    } else if (qualifiedBefore && !qualifiesNow) {
      // Team Fundraising Profile removed from demo day
      await this.analyticsService.trackEvent({
        name: 'demo-day-team-profile-removed',
        distinctId: teamUid,
        properties: {
          teamUid,
          demoDayUid,
          profileUid: profile.uid,
          fromStatus: prevStatus,
          toStatus: newStatus,
          foundersCount,
          hasOnePager: Boolean(profile.onePagerUploadUid),
          hasVideo: Boolean(profile.videoUploadUid),
        },
      });
    }
  }

  async updateFundraisingOnePager(
    memberEmail: string,
    teamUid: string,
    onePagerUploadUid: string,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
    }

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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async deleteFundraisingOnePager(memberEmail: string, teamUid: string, demoDayUidOrSlug: string): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

    if (profile?.onePagerUpload) {
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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingVideo(
    memberEmail: string,
    teamUid: string,
    videoUploadUid: string,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
    }

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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingDescription(
    memberEmail: string,
    teamUid: string,
    description: string,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async deleteFundraisingVideo(memberEmail: string, teamUid: string, demoDayUidOrSlug: string): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

    if (profile?.videoUpload) {
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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async updateFundraisingTeam(
    memberEmail: string,
    teamUid: string,
    data: {
      name?: string;
      shortDescription?: string;
      website?: string | null;
      industryTags?: string[];
      fundingStage?: string;
      logo?: string;
    },
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
    }

    const updateData: any = {};

    if (data.name) {
      updateData.name = data.name;
    }

    if (data.shortDescription) {
      updateData.shortDescription = data.shortDescription;
    }

    if (data.website) {
      updateData.website = data.website;
    }

    if (data.logo) {
      updateData.logoUid = data.logo;
    }

    if (data.fundingStage) {
      updateData.fundingStageUid = data.fundingStage;
    }

    if (data.industryTags) {
      updateData.industryTags = {
        set: data.industryTags.map((uid) => ({ uid })),
      };
    }

    // Update team
    await this.prisma.team.update({
      where: { uid: teamUid },
      data: updateData,
    });

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);
    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async getCurrentDemoDayFundraisingProfiles(
    memberEmail: string,
    demoDayUidOrSlug: string,
    params?: { stage?: string[]; industry?: string[]; search?: string },
    showDraft = false
  ): Promise<any[]> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    // Check access and get user info - throws if no access
    const { participantUid, isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    //Condition #1: admins with showDraft get all profiles - otherwise only published ones
    const where = this.buildProfilesWhere(params, demoDay.uid, isAdmin, showDraft);

    const profiles = await this.fetchProfiles(where);
    if (profiles.length === 0) return [];

    // Condition #2: fundraising profile must have at least one ENABLED FOUNDER participant in the demo day
    const filtered = await this.filterProfilesByEnabledFounders(demoDay.uid, profiles);
    if (filtered.length === 0) return [];

    // attach "likedByMe/connectedByMe/investedByMe" flags for the requesting user
    const interests = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: {
        demoDayUid: demoDay.uid,
        memberUid: participantUid,
        teamFundraisingProfileUid: { in: filtered.map((p) => p.uid) },
        isPrepDemoDay: isAdmin,
      },
      select: {
        teamFundraisingProfileUid: true,
        liked: true,
        connected: true,
        invested: true,
        referral: true,
      },
    });
    const flagsByProfile = interests.reduce((acc, it) => {
      acc[it.teamFundraisingProfileUid] = {
        liked: it.liked,
        connected: it.connected,
        invested: it.invested,
        referral: it.referral,
      };
      return acc;
    }, {} as Record<string, { liked: boolean; connected: boolean; invested: boolean; referral: boolean }>);
    for (const p of filtered) {
      const f = flagsByProfile[p.uid] || { liked: false, connected: false, invested: false, referral: false };
      (p as any).liked = f.liked;
      (p as any).connected = f.connected;
      (p as any).invested = f.invested;
      (p as any).referral = f.referral;
    }

    // Stable personalized order based on user email
    return this.sortProfilesForUser(participantUid, filtered);
  }

  private buildProfilesWhere(
    params: { stage?: string | string[]; industry?: string | string[]; search?: string } | undefined,
    demoDayUid: string,
    isAdmin = false,
    showDraft = false
  ): any {
    const where: any = {
      demoDayUid: demoDayUid,
    };

    // show all profiles if admin and showDraft parameter are presented
    if (!(isAdmin && showDraft)) {
      where.status = 'PUBLISHED'; // Condition #1: exclude DISABLED or DRAFT
      where.onePagerUploadUid = { not: null }; // Condition #1: onePager must be uploaded
      where.videoUploadUid = { not: null }; // Condition #1: video must be uploaded
    }

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
        where.team.name = { contains: params.search, mode: 'insensitive' }; // search by team name
      }
    }

    return where;
  }

  private async fetchProfiles(where: any): Promise<any[]> {
    const [profiles, founders] = await Promise.all([
      this.prisma.teamFundraisingProfile.findMany({
        where,
        orderBy: {
          createdAt: 'asc',
        },
        include: {
          team: {
            select: {
              uid: true,
              name: true,
              shortDescription: true,
              website: true,
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
          demoDayUid: where.demoDayUid,
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
    return profiles.map((profile) => ({
      ...profile,
      founders: foundersByTeam[profile.teamUid] || [],
    }));
  }

  private async filterProfilesByEnabledFounders(demoDayUid: string, profiles: any[]): Promise<any[]> {
    // Collect teamUids from all candidate profiles
    const teamUids = profiles.map((p) => p.teamUid);

    // Find all teams that have at least one ENABLED FOUNDER participant in this demo day
    const founderTeams = await this.prisma.demoDayParticipant.findMany({
      where: {
        demoDayUid: demoDayUid,
        isDeleted: false,
        status: 'ENABLED',
        type: 'FOUNDER',
        teamUid: { in: teamUids },
      },
      select: { teamUid: true },
    });

    const allowedSet = new Set((founderTeams.map((t) => t.teamUid) as (string | null)[]).filter(Boolean) as string[]);
    // Exclude profiles where no ENABLED FOUNDER participants exist
    return profiles.filter((p) => allowedSet.has(p.teamUid));
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

  async generateVideoUploadUrl(
    memberEmail: string,
    teamUid: string,
    filename: string,
    filesize: number,
    mimetype: string,
    demoDayUidOrSlug: string
  ): Promise<{ uploadUid: string; presignedUrl: string; s3Key: string; expiresAt: string }> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

  async confirmVideoUpload(
    memberEmail: string,
    teamUid: string,
    uploadUid: string,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);

    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async generateOnePagerUploadUrl(
    memberEmail: string,
    teamUid: string,
    filename: string,
    filesize: number,
    mimetype: string,
    demoDayUidOrSlug: string
  ): Promise<{ uploadUid: string; presignedUrl: string; s3Key: string; expiresAt: string }> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
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

  async confirmOnePagerUpload(
    memberEmail: string,
    teamUid: string,
    uploadUid: string,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
    }

    // Get the upload record
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

    await this.updateFundraisingProfileStatus(teamUid, demoDay.uid);

    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async uploadOnePagerPreviewByMember(
    memberEmail: string,
    teamUid: string,
    previewImage: Express.Multer.File,
    previewImageSmall: Express.Multer.File | undefined,
    demoDayUidOrSlug: string
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    const { isAdmin } = await this.demoDaysService.checkDemoDayAccess(memberEmail, demoDay.uid);

    // If not admin, validate that the user is a founder of the specified team
    if (!isAdmin) {
      await this.validateTeamFounderAccess(memberEmail, teamUid, demoDay.uid);
    }

    // Get the current fundraising profile
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

    await this.uploadOnePagerPreview(profile, previewImage, previewImageSmall);

    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async uploadOnePagerPreviewByTeam(
    teamUid: string,
    demoDayUidOrSlug: string,
    previewImage: Express.Multer.File,
    previewImageSmall?: Express.Multer.File
  ): Promise<any> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);
    if (!demoDay) {
      throw new ForbiddenException('No demo day found');
    }

    // Get the current fundraising profile
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

    // Update the one-pager upload with the preview image URL
    await this.uploadOnePagerPreview(profile, previewImage, previewImageSmall);

    return this.getCurrentDemoDayFundraisingProfileByTeamUid(teamUid, demoDay.uid);
  }

  async uploadOnePagerPreview(
    profile?: (TeamFundraisingProfile & { onePagerUpload: Upload | null }) | null,
    previewImage?: Express.Multer.File,
    previewImageSmall?: Express.Multer.File
  ) {
    if (!profile) {
      throw new NotFoundException('Team fundraising profile not found');
    }

    if (!profile.onePagerUpload) {
      throw new BadRequestException('No one-pager upload found. Please upload a one-pager first.');
    }

    if (!previewImage) {
      throw new BadRequestException('No preview file.');
    }

    // Upload the preview image using the uploads service
    const [previewUpload, previewSmallUpload] = await Promise.all([
      this.uploadsService.uploadGeneric({
        file: previewImage,
        kind: UploadKind.IMAGE,
        scopeType: 'NONE',
      }),
      previewImageSmall
        ? this.uploadsService.uploadGeneric({
            file: previewImageSmall,
            kind: UploadKind.IMAGE,
            scopeType: 'NONE',
          })
        : Promise.resolve(),
    ]);

    // Update the one-pager upload with the preview image URL
    await this.prisma.upload.update({
      where: { uid: profile.onePagerUpload.uid },
      data: {
        previewImageUrl: previewUpload.url,
        previewImageSmallUrl: previewSmallUpload?.url,
      },
    });
  }
}

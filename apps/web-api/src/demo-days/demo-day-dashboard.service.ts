import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { FounderDashboardResponse, InvestorDashboardResponse } from '@protocol-labs-network/contracts';

interface FounderDashboardParams {
  page?: number;
  limit?: number;
  demoDayUid?: string;
  activity?: 'liked' | 'connected' | 'invested' | 'referral' | 'feedback';
  search?: string;
  sortBy?: 'date' | 'demoDay';
  sortOrder?: 'asc' | 'desc';
  engagedOnly?: boolean;
  teamUid?: string;
}

interface InvestorDashboardParams {
  page?: number;
  limit?: number;
  demoDayUid?: string;
  activity?: 'liked' | 'connected' | 'invested' | 'referral' | 'feedback';
  search?: string;
  sortBy?: 'date' | 'demoDay';
  sortOrder?: 'asc' | 'desc';
}

@Injectable()
export class DemoDayDashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the founder dashboard - shows investors who engaged with the founder's team(s)
   */
  async getFounderDashboard(memberEmail: string, params: FounderDashboardParams): Promise<FounderDashboardResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? 'date';
    const sortOrder = params.sortOrder ?? 'desc';
    const engagedOnly = params.engagedOnly ?? true;
    const { demoDayUid, activity, search, teamUid } = params;

    // Validate founder access and get their teams
    const { founderTeams, demoDayUids } = await this.validateFounderAccess(memberEmail, demoDayUid);

    // Filter teams if teamUid is specified
    const selectedTeams = teamUid ? founderTeams.filter((t) => t.uid === teamUid) : founderTeams;

    if (selectedTeams.length === 0) {
      return this.emptyFounderResponse(founderTeams);
    }

    // Get TeamFundraisingProfile UIDs for the founder's team(s)
    const fundraisingProfiles = await this.prisma.teamFundraisingProfile.findMany({
      where: {
        teamUid: { in: selectedTeams.map((t) => t.uid) },
        ...(demoDayUid ? { demoDayUid } : { demoDayUid: { in: demoDayUids } }),
      },
      select: { uid: true, demoDayUid: true },
    });

    const profileUids = fundraisingProfiles.map((p) => p.uid);

    if (profileUids.length === 0 && engagedOnly) {
      return this.emptyFounderResponse(founderTeams);
    }

    if (engagedOnly) {
      // Get engaged investors
      return this.getEngagedInvestors(
        profileUids,
        demoDayUid,
        demoDayUids,
        activity,
        search,
        sortBy,
        sortOrder,
        page,
        limit,
        founderTeams
      );
    } else {
      // Get all investors in the demo day(s)
      return this.getAllInvestors(
        demoDayUid,
        demoDayUids,
        profileUids,
        activity,
        search,
        sortBy,
        sortOrder,
        page,
        limit,
        founderTeams
      );
    }
  }

  /**
   * Get the investor dashboard - shows teams the investor has engaged with
   */
  async getInvestorDashboard(memberEmail: string, params: InvestorDashboardParams): Promise<InvestorDashboardResponse> {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const sortBy = params.sortBy ?? 'date';
    const sortOrder = params.sortOrder ?? 'desc';
    const { demoDayUid, activity, search } = params;

    // Validate investor access
    const { member, demoDayUids } = await this.validateInvestorAccess(memberEmail, demoDayUid);

    // Build where clause for engagements
    const activityFilter = activity ? { [activity]: true } : {};

    const searchFilter = search
      ? {
          teamFundraisingProfile: {
            team: {
              name: { contains: search, mode: 'insensitive' as const },
            },
          },
        }
      : {};

    const whereClause = {
      memberUid: member.uid,
      isPrepDemoDay: false,
      totalCount: { gt: 0 },
      ...(demoDayUid ? { demoDayUid } : { demoDayUid: { in: demoDayUids } }),
      ...activityFilter,
      ...searchFilter,
    };

    // Get total count for pagination
    const total = await this.prisma.demoDayExpressInterestStatistic.count({
      where: whereClause,
    });

    // Get paginated engagements
    const engagements = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: whereClause,
      include: {
        teamFundraisingProfile: {
          include: {
            team: {
              select: {
                uid: true,
                name: true,
                logo: { select: { uid: true, url: true } },
                fundingStage: { select: { uid: true, title: true } },
                industryTags: { select: { uid: true, title: true } },
              },
            },
          },
        },
        demoDay: { select: { uid: true, title: true, slugURL: true } },
      },
      orderBy: sortBy === 'demoDay' ? { demoDay: { startDate: sortOrder } } : { updatedAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform to response format
    const teams = engagements.map((engagement) => ({
      uid: engagement.teamFundraisingProfile.team.uid,
      name: engagement.teamFundraisingProfile.team.name,
      logo: engagement.teamFundraisingProfile.team.logo,
      fundingStage: engagement.teamFundraisingProfile.team.fundingStage,
      industryTags: engagement.teamFundraisingProfile.team.industryTags,
      activity: {
        liked: engagement.liked,
        connected: engagement.connected,
        invested: engagement.invested,
        referral: engagement.referral,
        feedback: engagement.feedback,
      },
      lastActivityDate: engagement.updatedAt?.toISOString() ?? null,
      demoDay: {
        uid: engagement.demoDay.uid,
        title: engagement.demoDay.title,
        slugURL: engagement.demoDay.slugURL,
      },
    }));

    return {
      teams,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async validateFounderAccess(
    memberEmail: string,
    demoDayUid?: string
  ): Promise<{
    member: { uid: string; name: string };
    founderTeams: Array<{ uid: string; name: string }>;
    demoDayUids: string[];
  }> {
    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        name: true,
        demoDayParticipants: {
          where: {
            type: 'FOUNDER',
            status: 'ENABLED',
            isDeleted: false,
            ...(demoDayUid ? { demoDayUid } : {}),
          },
          select: {
            demoDayUid: true,
            teamUid: true,
            team: { select: { uid: true, name: true } },
          },
        },
      },
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('User is not an enabled founder participant in any demo day');
    }

    const founderTeams = member.demoDayParticipants
      .flatMap((p) => (p.team ? [{ uid: p.team.uid, name: p.team.name }] : []))
      .filter((t, i, arr) => arr.findIndex((x) => x.uid === t.uid) === i); // unique

    const demoDayUids = [...new Set(member.demoDayParticipants.map((p) => p.demoDayUid))];

    return { member: { uid: member.uid, name: member.name || '' }, founderTeams, demoDayUids };
  }

  private async validateInvestorAccess(
    memberEmail: string,
    demoDayUid?: string
  ): Promise<{
    member: { uid: string; name: string };
    demoDayUids: string[];
  }> {
    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        name: true,
        demoDayParticipants: {
          where: {
            type: 'INVESTOR',
            status: 'ENABLED',
            isDeleted: false,
            ...(demoDayUid ? { demoDayUid } : {}),
          },
          select: { demoDayUid: true },
        },
      },
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('User is not an enabled investor participant in any demo day');
    }

    const demoDayUids = [...new Set(member.demoDayParticipants.map((p) => p.demoDayUid))];

    return { member: { uid: member.uid, name: member.name || '' }, demoDayUids };
  }

  private async getEngagedInvestors(
    profileUids: string[],
    demoDayUid: string | undefined,
    demoDayUids: string[],
    activity: string | undefined,
    search: string | undefined,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    page: number,
    limit: number,
    founderTeams: Array<{ uid: string; name: string }>
  ): Promise<FounderDashboardResponse> {
    const activityFilter = activity ? { [activity]: true } : {};

    const searchFilter = search
      ? {
          member: {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                teamMemberRoles: {
                  some: {
                    team: { name: { contains: search, mode: 'insensitive' as const } },
                  },
                },
              },
            ],
          },
        }
      : {};

    const whereClause = {
      teamFundraisingProfileUid: { in: profileUids },
      isPrepDemoDay: false,
      totalCount: { gt: 0 },
      ...(demoDayUid ? { demoDayUid } : { demoDayUid: { in: demoDayUids } }),
      ...activityFilter,
      ...searchFilter,
    };

    // Get total count for pagination
    const total = await this.prisma.demoDayExpressInterestStatistic.count({
      where: whereClause,
    });

    // Get paginated engagements
    const engagements = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: whereClause,
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            image: { select: { uid: true, url: true } },
            investorProfile: {
              select: {
                type: true,
                investmentFocus: true,
                typicalCheckSize: true,
              },
            },
            teamMemberRoles: {
              where: { investmentTeam: true },
              include: {
                team: {
                  select: {
                    uid: true,
                    name: true,
                    investorProfile: {
                      select: {
                        type: true,
                        investmentFocus: true,
                        typicalCheckSize: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        demoDay: { select: { uid: true, title: true, slugURL: true } },
      },
      orderBy: sortBy === 'demoDay' ? { demoDay: { startDate: sortOrder } } : { updatedAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Transform to response format
    const investors = engagements.map((engagement) => {
      // Get investor profile from member or their investment team
      const investmentTeamRole = engagement.member.teamMemberRoles?.[0];
      const investorProfile = engagement.member.investorProfile ?? investmentTeamRole?.team?.investorProfile;

      // Determine organization
      const organization = investmentTeamRole?.team
        ? {
            uid: investmentTeamRole.team.uid,
            name: investmentTeamRole.team.name,
            type: investmentTeamRole.team.investorProfile?.type ?? null,
          }
        : null;

      return {
        uid: engagement.member.uid,
        name: engagement.member.name || '',
        image: engagement.member.image,
        organization,
        investmentFocus: investorProfile?.investmentFocus ?? [],
        typicalCheckSize: investorProfile?.typicalCheckSize ?? null,
        activity: {
          liked: engagement.liked,
          connected: engagement.connected,
          invested: engagement.invested,
          referral: engagement.referral,
          feedback: engagement.feedback,
        },
        lastActivityDate: engagement.updatedAt?.toISOString() ?? null,
        demoDay: {
          uid: engagement.demoDay.uid,
          title: engagement.demoDay.title,
          slugURL: engagement.demoDay.slugURL,
        },
        hasFeedback: engagement.feedback,
      };
    });

    return {
      investors,
      teams: founderTeams,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async getAllInvestors(
    demoDayUid: string | undefined,
    demoDayUids: string[],
    founderProfileUids: string[],
    activity: string | undefined,
    search: string | undefined,
    sortBy: string,
    sortOrder: 'asc' | 'desc',
    page: number,
    limit: number,
    founderTeams: Array<{ uid: string; name: string }>
  ): Promise<FounderDashboardResponse> {
    // When engagedOnly=false, we get all investors in the demo day(s)
    // and fetch engagement data separately

    const searchFilter = search
      ? {
          member: {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              {
                teamMemberRoles: {
                  some: {
                    team: { name: { contains: search, mode: 'insensitive' as const } },
                  },
                },
              },
            ],
          },
        }
      : {};

    const whereClause = {
      type: 'INVESTOR' as const,
      status: 'ENABLED' as const,
      isDeleted: false,
      ...(demoDayUid ? { demoDayUid } : { demoDayUid: { in: demoDayUids } }),
      ...searchFilter,
    };

    // Get total count for pagination
    const total = await this.prisma.demoDayParticipant.count({
      where: whereClause,
    });

    // Get paginated participants
    const participants = await this.prisma.demoDayParticipant.findMany({
      where: whereClause,
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            image: { select: { uid: true, url: true } },
            investorProfile: {
              select: {
                type: true,
                investmentFocus: true,
                typicalCheckSize: true,
              },
            },
            teamMemberRoles: {
              where: { investmentTeam: true },
              include: {
                team: {
                  select: {
                    uid: true,
                    name: true,
                    investorProfile: {
                      select: {
                        type: true,
                        investmentFocus: true,
                        typicalCheckSize: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
        demoDay: { select: { uid: true, title: true, slugURL: true } },
      },
      orderBy: sortBy === 'demoDay' ? { demoDay: { startDate: sortOrder } } : { createdAt: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    // Fetch engagement data separately for founder's team profiles
    const memberUids = participants.map((p) => p.member.uid);
    const engagementMap = new Map<
      string,
      {
        liked: boolean;
        connected: boolean;
        invested: boolean;
        referral: boolean;
        feedback: boolean;
        updatedAt: Date | null;
      }
    >();

    if (founderProfileUids.length > 0 && memberUids.length > 0) {
      const engagements = await this.prisma.demoDayExpressInterestStatistic.findMany({
        where: {
          memberUid: { in: memberUids },
          teamFundraisingProfileUid: { in: founderProfileUids },
          isPrepDemoDay: false,
        },
        select: {
          memberUid: true,
          liked: true,
          connected: true,
          invested: true,
          referral: true,
          feedback: true,
          updatedAt: true,
        },
      });

      for (const eng of engagements) {
        engagementMap.set(eng.memberUid, {
          liked: eng.liked,
          connected: eng.connected,
          invested: eng.invested,
          referral: eng.referral,
          feedback: eng.feedback,
          updatedAt: eng.updatedAt,
        });
      }
    }

    // Filter by activity if specified (post-query filter for all investors mode)
    let filteredParticipants = participants;
    if (activity) {
      filteredParticipants = participants.filter((p) => {
        const engagement = engagementMap.get(p.member.uid);
        return engagement?.[activity as keyof typeof engagement] === true;
      });
    }

    // Transform to response format
    const investors = filteredParticipants.map((participant) => {
      const engagement = engagementMap.get(participant.member.uid);
      const investmentTeamRole = participant.member.teamMemberRoles?.[0];
      const investorProfile = participant.member.investorProfile ?? investmentTeamRole?.team?.investorProfile;

      const organization = investmentTeamRole?.team
        ? {
            uid: investmentTeamRole.team.uid,
            name: investmentTeamRole.team.name,
            type: investmentTeamRole.team.investorProfile?.type ?? null,
          }
        : null;

      return {
        uid: participant.member.uid,
        name: participant.member.name || '',
        image: participant.member.image,
        organization,
        investmentFocus: investorProfile?.investmentFocus ?? [],
        typicalCheckSize: investorProfile?.typicalCheckSize ?? null,
        activity: engagement
          ? {
              liked: engagement.liked,
              connected: engagement.connected,
              invested: engagement.invested,
              referral: engagement.referral,
              feedback: engagement.feedback,
            }
          : {
              liked: false,
              connected: false,
              invested: false,
              referral: false,
              feedback: false,
            },
        lastActivityDate: engagement?.updatedAt?.toISOString() ?? null,
        demoDay: {
          uid: participant.demoDay.uid,
          title: participant.demoDay.title,
          slugURL: participant.demoDay.slugURL,
        },
        hasFeedback: engagement?.feedback ?? false,
      };
    });

    return {
      investors,
      teams: founderTeams,
      pagination: {
        page,
        limit,
        total: activity ? investors.length : total, // Adjust total if filtered post-query
        totalPages: Math.ceil((activity ? investors.length : total) / limit),
      },
    };
  }

  private emptyFounderResponse(founderTeams: Array<{ uid: string; name: string }>): FounderDashboardResponse {
    return {
      investors: [],
      teams: founderTeams,
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };
  }
}

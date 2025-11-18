import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { MembersService } from '../members/members.service';

type ExpressInterestStats = { liked: number; connected: number; invested: number; referral: number; total: number };

@Injectable()
export class DemoDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly membersService: MembersService
  ) {}

  async getCurrentDemoDay(): Promise<DemoDay | null> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: {
          in: [
            DemoDayStatus.UPCOMING,
            DemoDayStatus.REGISTRATION_OPEN,
            DemoDayStatus.EARLY_ACCESS,
            DemoDayStatus.ACTIVE,
            DemoDayStatus.COMPLETED,
            DemoDayStatus.ARCHIVED,
          ],
        },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    return demoDay;
  }

  async getCurrentDemoDayAccess(memberEmail: string | null): Promise<{
    access: 'none' | 'INVESTOR' | 'FOUNDER';
    status: 'NONE' | 'UPCOMING' | 'REGISTRATION_OPEN' | 'ACTIVE' | 'COMPLETED';
    uid?: string;
    date?: string;
    title?: string;
    description?: string;
    teamsCount?: number;
    investorsCount?: number;
    isDemoDayAdmin?: boolean;
    isEarlyAccess?: boolean;
    confidentialityAccepted?: boolean;
  }> {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      return {
        access: 'none',
        status: 'NONE',
        teamsCount: 0,
        investorsCount: 0,
        confidentialityAccepted: false,
      };
    }

    // Handle unauthorized users
    if (!memberEmail) {
      return {
        access: 'none',
        status: this.getExternalDemoDayStatus(demoDay.status),
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        teamsCount: 0,
        investorsCount: 0,
        confidentialityAccepted: false,
      };
    }

    const [investorsCount, teamsCount, member] = await Promise.all([
      this.prisma.member.count({
        where: {
          AND: [
            {
              accessLevel: {
                in: ['L5', 'L6'],
              },
            },
            {
              OR: [
                {
                  investorProfile: {
                    secRulesAccepted: true,
                  },
                },
                {
                  investorProfile: {
                    type: { not: null },
                  },
                },
              ],
            },
            // If InvestorProfile.type = 'FUND', member must belong to a team with isFund = true
            {
              OR: [
                // Allow if not FUND type
                {
                  investorProfile: {
                    OR: [{ type: { not: 'FUND' } }, { type: { equals: null } }],
                  },
                },
                // Or if FUND type, require member to be in a team with isFund = true
                {
                  AND: [
                    {
                      investorProfile: {
                        type: 'FUND',
                      },
                    },
                    {
                      teamMemberRoles: {
                        some: {
                          investmentTeam: true,
                          team: {
                            isFund: true,
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
            // If InvestorProfile.type = 'ANGEL', at least one field must be filled
            {
              OR: [
                // Allow if not ANGEL type
                {
                  investorProfile: {
                    OR: [{ type: { not: 'ANGEL' } }, { type: { equals: null } }],
                  },
                },
                // Or if ANGEL type, at least one field must be filled
                {
                  AND: [
                    {
                      investorProfile: {
                        type: 'ANGEL',
                      },
                    },
                    {
                      investorProfile: {
                        OR: [
                          {
                            investInStartupStages: { isEmpty: false },
                          },
                          {
                            typicalCheckSize: { not: null, gt: 0 },
                          },
                          {
                            investmentFocus: { isEmpty: false },
                          },
                        ],
                      },
                    },
                  ],
                },
              ],
            },
            // If InvestorProfile.type = 'ANGEL_AND_FUND', must satisfy at least one of FUND or ANGEL requirements
            {
              OR: [
                // Allow if not ANGEL_AND_FUND type
                {
                  investorProfile: {
                    OR: [{ type: { not: 'ANGEL_AND_FUND' } }, { type: { equals: null } }],
                  },
                },
                // Or if ANGEL_AND_FUND type, must satisfy at least one requirement
                {
                  AND: [
                    {
                      investorProfile: {
                        type: 'ANGEL_AND_FUND',
                      },
                    },
                    {
                      OR: [
                        // FUND requirement: member must be in a team with isFund = true and investmentTeam = true
                        {
                          teamMemberRoles: {
                            some: {
                              investmentTeam: true,
                              team: {
                                isFund: true,
                              },
                            },
                          },
                        },
                        // ANGEL requirement: at least one field must be filled
                        {
                          investorProfile: {
                            OR: [
                              {
                                investInStartupStages: { isEmpty: false },
                              },
                              {
                                typicalCheckSize: { not: null, gt: 0 },
                              },
                              {
                                investmentFocus: { isEmpty: false },
                              },
                            ],
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      }),
      this.prisma.teamFundraisingProfile.count({
        where: {
          demoDayUid: demoDay.uid,
          status: 'PUBLISHED',
          onePagerUploadUid: { not: null },
          videoUploadUid: { not: null },
          team: {
            demoDayParticipants: {
              some: {
                demoDayUid: demoDay.uid,
                isDeleted: false,
                status: 'ENABLED',
                type: 'FOUNDER',
              },
            },
          },
        },
      }),
      this.prisma.member.findUnique({
        where: { email: memberEmail },
        select: {
          uid: true,
          accessLevel: true,
          memberRoles: {
            select: {
              name: true,
            },
          },
          demoDayParticipants: {
            where: {
              demoDayUid: demoDay.uid,
              isDeleted: false,
            },
            select: {
              uid: true,
              status: true,
              type: true,
              isDemoDayAdmin: true,
              hasEarlyAccess: true,
              confidentialityAccepted: true,
            },
          },
        },
      }),
    ]);

    if (!member || ['L0', 'L1', 'Rejected'].includes(member?.accessLevel ?? '')) {
      return {
        access: 'none',
        status: this.getExternalDemoDayStatus(demoDay.status),
      };
    }

    // Check if member is directory admin
    const roleNames = member.memberRoles.map((role) => role.name);
    const isDirectoryAdmin = roleNames.includes('DIRECTORYADMIN');

    // Check demo day participant
    const participant = member.demoDayParticipants[0];
    if (participant && participant.status !== 'ENABLED') {
      return {
        access: 'none',
        status: this.getExternalDemoDayStatus(demoDay.status),
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        teamsCount,
        investorsCount,
        confidentialityAccepted: participant.confidentialityAccepted,
      };
    }

    if (participant && participant.status === 'INVITED') {
      participant.status = 'ENABLED';
      await this.prisma.demoDayParticipant.update({
        where: { uid: participant.uid },
        data: { status: 'ENABLED' },
      });
    }

    if (participant && participant.status === 'ENABLED') {
      // Member is an enabled participant
      const access = participant.type === 'INVESTOR' ? 'INVESTOR' : 'FOUNDER';

      return {
        access,
        uid: demoDay.uid,
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        status: this.getExternalDemoDayStatus(
          demoDay.status,
          participant.type === 'FOUNDER' || participant.hasEarlyAccess
        ),
        isEarlyAccess: demoDay.status === DemoDayStatus.EARLY_ACCESS,
        isDemoDayAdmin: participant.isDemoDayAdmin || isDirectoryAdmin,
        confidentialityAccepted: participant.confidentialityAccepted,
        teamsCount,
        investorsCount,
      };
    }

    return {
      access: 'none',
      status: this.getExternalDemoDayStatus(demoDay.status),
      date: demoDay.startDate.toISOString(),
      title: demoDay.title,
      description: demoDay.description,
      teamsCount,
      investorsCount,
      confidentialityAccepted: false,
    };
  }

  // Admin methods

  async createDemoDay(
    data: {
      startDate: Date;
      endDate: Date;
      title: string;
      slugURL: string;
      description: string;
      shortDescription?: string | null;
      status: DemoDayStatus;
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    // Check if slug already exists
    const slugURL = data.slugURL;
    const existingDemoDay = await this.prisma.demoDay.findFirst({ where: { slugURL, isDeleted: false } });
    if (existingDemoDay) {
      throw new ConflictException(
        `A demo day with slug "${slugURL}" already exists. Please choose a different title or slug.`
      );
    }

    const created = await this.prisma.demoDay.create({
      data: {
        startDate: data.startDate,
        endDate: data.endDate,
        title: data.title,
        description: data.description,
        shortDescription: data.shortDescription,
        status: data.status,
        slugURL,
      },
    });

    // Track "Demo Day created"
    await this.analyticsService.trackEvent({
      name: 'demo-day-created',
      distinctId: created.uid,
      properties: {
        demoDayUid: created.uid,
        title: created.title,
        description: created.description,
        shortDescription: created.shortDescription,
        startDate: created.startDate?.toISOString?.() || null,
        endDate: created.endDate?.toISOString?.() || null,
        status: created.status,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
      },
    });

    return created;
  }

  async getAllDemoDays(excludeInactive = false): Promise<DemoDay[]> {
    const whereClause: any = {
      isDeleted: false,
    };

    if (excludeInactive) {
      whereClause.status = {
        not: DemoDayStatus.ARCHIVED,
      };
      whereClause.teamFundraisingProfiles = {
        some: {
          status: {
            not: 'DISABLED',
          },
        },
      };
    }

    return this.prisma.demoDay.findMany({
      where: whereClause,
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        title: true,
        description: true,
        shortDescription: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDemoDayByUid(uid: string): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: { uid, isDeleted: false },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        title: true,
        description: true,
        shortDescription: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!demoDay) {
      throw new NotFoundException(`Demo day with uid ${uid} not found`);
    }

    return demoDay;
  }

  async getDemoDayBySlugURL(slugURL: string): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: { slugURL, isDeleted: false },
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        title: true,
        description: true,
        shortDescription: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!demoDay) {
      throw new NotFoundException(`Demo day with slug ${slugURL} not found`);
    }

    return demoDay;
  }

  async updateDemoDay(
    uid: string,
    data: {
      startDate?: Date;
      endDate?: Date;
      title?: string;
      description?: string;
      shortDescription?: string | null;
      status?: DemoDayStatus;
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // First check if demo day exists
    const before = await this.getDemoDayByUid(uid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    const updateData: any = {};

    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate;
    }
    if (data.endDate !== undefined) {
      updateData.endDate = data.endDate;
    }
    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.shortDescription !== undefined) {
      updateData.shortDescription = data.shortDescription;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    const updated = await this.prisma.demoDay.update({
      where: { uid },
      data: updateData,
      select: {
        id: true,
        uid: true,
        slugURL: true,
        startDate: true,
        endDate: true,
        title: true,
        description: true,
        shortDescription: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    // Track "details updated" (name/description/startDate/endDate) only if any changed
    const detailsChanged: string[] = [];
    if (updateData.title !== undefined && before.title !== updated.title) detailsChanged.push('title');
    if (updateData.description !== undefined && before.description !== updated.description)
      detailsChanged.push('description');
    if (updateData.startDate !== undefined && before.startDate?.toISOString?.() !== updated.startDate?.toISOString?.())
      detailsChanged.push('startDate');
    if (updateData.endDate !== undefined && before.endDate?.toISOString?.() !== updated.endDate?.toISOString?.())
      detailsChanged.push('endDate');

    if (detailsChanged.length > 0) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-details-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          changedFields: detailsChanged,
          title: updated.title,
          description: updated.description,
          startDate: updated.startDate?.toISOString?.() || null,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    // Track "status updated" if changed
    if (updateData.status !== undefined && before.status !== updated.status) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-status-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          fromStatus: before.status,
          toStatus: updated.status,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    return updated;
  }

  private getExternalDemoDayStatus(
    demoDayStatus: DemoDayStatus,
    hasEarlyAccess = false
  ): 'UPCOMING' | 'REGISTRATION_OPEN' | 'ACTIVE' | 'COMPLETED' {
    if (demoDayStatus === DemoDayStatus.REGISTRATION_OPEN) {
      return 'REGISTRATION_OPEN';
    }

    // Never return EARLY_ACCESS to frontend - if hasEarlyAccess is true, return ACTIVE, otherwise return UPCOMING
    if (demoDayStatus === DemoDayStatus.EARLY_ACCESS) {
      if (hasEarlyAccess) {
        return 'ACTIVE';
      } else {
        return 'UPCOMING';
      }
    }

    return demoDayStatus.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  }

  async getCurrentExpressInterestStats(isPrepDemoDay: boolean): Promise<ExpressInterestStats> {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) return { liked: 0, connected: 0, invested: 0, referral: 0, total: 0 };

    const agg = await this.prisma.demoDayExpressInterestStatistic.aggregate({
      where: {
        demoDayUid: demoDay.uid,
        isPrepDemoDay,
      },
      _sum: {
        likedCount: true,
        connectedCount: true,
        investedCount: true,
        referralCount: true,
      },
    });

    const liked = agg._sum.likedCount ?? 0;
    const connected = agg._sum.connectedCount ?? 0;
    const invested = agg._sum.investedCount ?? 0;
    const referral = agg._sum.referralCount ?? 0;
    const total = liked + connected + invested + referral;

    return { liked, connected, invested, referral, total };
  }

  async updateConfidentialityAcceptance(memberEmail: string, accepted: boolean): Promise<{ success: boolean }> {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      throw new NotFoundException('No current demo day found');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const existingParticipant = await this.prisma.demoDayParticipant.findUnique({
      where: {
        demoDayUid_memberUid: {
          demoDayUid: demoDay.uid,
          memberUid: member.uid,
        },
      },
    });

    if (existingParticipant) {
      await this.prisma.demoDayParticipant.update({
        where: { uid: existingParticipant.uid },
        data: { confidentialityAccepted: accepted },
      });
    }

    return { success: true };
  }

  async getTeamAnalytics(teamUid: string) {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      throw new NotFoundException('No active demo day found');
    }

    // Find the fundraising profile for this team
    const fundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      select: {
        uid: true,
        team: {
          select: {
            uid: true,
            name: true,
          },
        },
      },
    });

    if (!fundraisingProfile) {
      throw new NotFoundException('Team fundraising profile not found for current demo day');
    }

    // Get all interest statistics for this team's fundraising profile
    const allStats = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: {
        demoDayUid: demoDay.uid,
        teamFundraisingProfileUid: fundraisingProfile.uid,
      },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            teamMemberRoles: {
              where: {
                investmentTeam: true,
              },
              include: {
                team: {
                  select: {
                    uid: true,
                    name: true,
                    isFund: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    // Calculate summary statistics
    const uniqueInvestors = new Set(allStats.map((s) => s.memberUid)).size;
    const totalLikes = allStats.filter((s) => s.liked).length;
    const totalConnections = allStats.filter((s) => s.connected).length;
    const totalInvestments = allStats.filter((s) => s.invested).length;
    const totalReferrals = allStats.filter((s) => s.referral).length;
    const totalEngagement = allStats.reduce((sum, s) => sum + s.totalCount, 0);

    // Build investor activity list
    const investorActivity = allStats
      .filter((s) => s.totalCount > 0) // Only show investors who have engaged
      .map((stat) => {
        const investmentTeamRole = stat.member.teamMemberRoles.find((role) => role.investmentTeam);
        const fundOrAngel = investmentTeamRole?.team;

        return {
          investorUid: stat.member.uid,
          investorName: stat.member.name,
          investorEmail: stat.member.email,
          fundOrAngel: fundOrAngel
            ? {
                uid: fundOrAngel.uid,
                name: fundOrAngel.name,
                isFund: fundOrAngel.isFund,
              }
            : null,
          activity: {
            liked: stat.liked,
            connected: stat.connected,
            invested: stat.invested,
            referral: stat.referral,
          },
          date: stat.updatedAt,
        };
      });

    // Group engagement by time
    // Use Event table for time-series data, but only count first occurrence of each action per investor
    const engagementOverTime = await this.prisma.$queryRaw<
      Array<{ hour: Date; likes: bigint; connects: bigint; invests: bigint; referrals: bigint }>
    >`
      WITH first_events AS (
        SELECT DISTINCT ON ("userId", props->>'teamUid', props->>'interestType')
          "userId",
          props->>'interestType' as interest_type,
          props->>'teamUid' as team_uid,
          ts
        FROM "Event"
        WHERE "eventType" = 'demo-day-express-interest'
          AND props->>'demoDayUid' = ${demoDay.uid}
          AND props->>'teamUid' = ${fundraisingProfile.team.uid}
        ORDER BY "userId", props->>'teamUid', props->>'interestType', ts
      )
      SELECT
        DATE_TRUNC('hour', ts) as hour,
        COUNT(*) FILTER (WHERE interest_type = 'like') as likes,
        COUNT(*) FILTER (WHERE interest_type = 'connect') as connects,
        COUNT(*) FILTER (WHERE interest_type = 'invest') as invests,
        COUNT(*) FILTER (WHERE interest_type = 'referral') as referrals
      FROM first_events
      GROUP BY DATE_TRUNC('hour', ts)
      ORDER BY hour
    `;

    return {
      team: {
        uid: fundraisingProfile.team.uid,
        name: fundraisingProfile.team.name,
      },
      demoDay: {
        uid: demoDay.uid,
        title: demoDay.title,
      },
      summary: {
        totalEngagement,
        uniqueInvestors,
        likes: totalLikes,
        connections: totalConnections,
        investments: totalInvestments,
        referrals: totalReferrals,
      },
      engagementOverTime: engagementOverTime.map((row) => ({
        timestamp: row.hour,
        likes: Number(row.likes),
        connects: Number(row.connects),
        invests: Number(row.invests),
        referrals: Number(row.referrals),
      })),
      investorActivity,
    };
  }

  async createFeedback(
    memberEmail: string,
    feedbackData: {
      rating: number;
      qualityComments?: string | null;
      improvementComments?: string | null;
      comment?: string | null;
      issues: string[];
    }
  ) {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      throw new NotFoundException('No current demo day found');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Create feedback (multiple submissions allowed)
    const feedback = await this.prisma.demoDayFeedback.create({
      data: {
        demoDayUid: demoDay.uid,
        memberUid: member.uid,
        rating: feedbackData.rating,
        qualityComments: feedbackData.qualityComments || null,
        improvementComments: feedbackData.improvementComments || null,
        comment: feedbackData.comment || null,
        issues: feedbackData.issues,
      },
    });

    // Track analytics event
    await this.analyticsService.trackEvent({
      name: 'demo-day-feedback-submitted',
      distinctId: member.uid,
      properties: {
        demoDayUid: demoDay.uid,
        feedbackUid: feedback.uid,
        rating: feedback.rating,
        hasComment: !!feedback.comment,
        hasQualityComments: !!feedback.qualityComments,
        hasImprovementComments: !!feedback.improvementComments,
        qualityComments: feedback.qualityComments,
        improvementComments: feedback.improvementComments,
        issuesCount: feedback.issues.length,
        issues: feedback.issues,
      },
    });

    return feedback;
  }

  async submitInvestorApplication(applicationData: {
    email: string;
    name: string;
    linkedinProfile?: string;
    role?: string;
    organisationFundName?: string;
    isAccreditedInvestor?: boolean;
  }) {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      throw new NotFoundException('No current demo day found');
    }

    // Check if demo day is accepting applications (REGISTRATION_OPEN status)
    if (demoDay.status !== DemoDayStatus.REGISTRATION_OPEN && demoDay.status !== DemoDayStatus.EARLY_ACCESS) {
      throw new BadRequestException('Demo day is not currently accepting applications');
    }

    const normalizedEmail = applicationData.email.toLowerCase().trim();

    // Check if a member already exists
    let member = await this.prisma.member.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: 'insensitive',
        },
      },
      select: {
        uid: true,
        email: true,
        accessLevel: true,
        investorProfile: true,
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
          },
        },
      },
    });

    let isNewMember = false;

    // If a member doesn't exist, create a new one with L0 access level
    if (!member) {
      isNewMember = true;
      member = await this.prisma.member.create({
        data: {
          email: normalizedEmail,
          name: applicationData.name,
          accessLevel: 'L0',
          signUpSource: `demoday-${demoDay.slugURL}`,
          linkedinHandler: applicationData.linkedinProfile,
        },
        select: {
          uid: true,
          email: true,
          accessLevel: true,
          investorProfile: true,
          demoDayParticipants: {
            where: {
              demoDayUid: demoDay.uid,
              isDeleted: false,
            },
          },
        },
      });

      // If an organisationFundName is provided, match it to a Team and create TeamMemberRole
      if (applicationData.organisationFundName) {
        const team = await this.prisma.team.findFirst({
          where: {
            name: {
              equals: applicationData.organisationFundName,
              mode: 'insensitive',
            },
          },
          select: {
            uid: true,
          },
        });

        if (team) {
          // Check if TeamMemberRole already exists for this member-team combination
          const existingRole = await this.prisma.teamMemberRole.findUnique({
            where: {
              memberUid_teamUid: {
                memberUid: member.uid,
                teamUid: team.uid,
              },
            },
          });

          // Only create if it doesn't exist
          if (!existingRole) {
            await this.prisma.teamMemberRole.create({
              data: {
                memberUid: member.uid,
                teamUid: team.uid,
                role: applicationData.role,
                investmentTeam: true,
              },
            });
          }
        }
      }
    }

    // Create or update investor profile
    if (!member.investorProfile) {
      const investorProfile = await this.prisma.investorProfile.create({
        data: {
          memberUid: member.uid,
          investmentFocus: [], // Will be filled in later by the investor
          secRulesAccepted: applicationData.isAccreditedInvestor ?? false,
          secRulesAcceptedAt: applicationData.isAccreditedInvestor ? new Date() : null,
        },
      });

      // Link investor profile to member
      await this.prisma.member.update({
        where: { uid: member.uid },
        data: { investorProfileId: investorProfile.uid },
      });
    } else if (applicationData.isAccreditedInvestor && !member.investorProfile.secRulesAccepted) {
      // Update existing profile if user accepted accredited investor terms
      await this.prisma.investorProfile.update({
        where: { uid: member.investorProfile.uid },
        data: {
          secRulesAccepted: true,
          secRulesAcceptedAt: new Date(),
        },
      });
    }

    // Check if already a participant for this demo day
    if (member.demoDayParticipants && member.demoDayParticipants.length > 0) {
      throw new BadRequestException('You have already submitted an application for this demo day');
    }

    // Create a demo day participant with PENDING status
    const participant = await this.prisma.demoDayParticipant.create({
      data: {
        demoDayUid: demoDay.uid,
        memberUid: member.uid,
        type: 'INVESTOR',
        status: 'PENDING', // Pending approval from admin
      },
    });

    // Track analytics event
    await this.analyticsService.trackEvent({
      name: 'demo-day-investor-application-submitted',
      distinctId: member.uid,
      properties: {
        demoDayUid: demoDay.uid,
        participantUid: participant.uid,
        email: normalizedEmail,
        name: applicationData.name,
        role: applicationData.role,
        organisationFundName: applicationData.organisationFundName,
        linkedinProfile: applicationData.linkedinProfile,
        isAccreditedInvestor: applicationData.isAccreditedInvestor ?? false,
        isNewMember,
      },
    });

    return {
      success: true,
      message: 'Your application has been submitted successfully. You will be notified once it is reviewed.',
      participantUid: participant.uid,
    };
  }

  /**
   * Check if a member has access to a specific demo day and determine their access level
   * @param memberEmail - Email of the member to check
   * @param demoDayUid - UID of the demo day
   * @returns Participant UID and admin status
   * @throws ForbiddenException if the member has no access
   */
  async checkDemoDayAccess(
    memberEmail: string,
    demoDayUid: string
  ): Promise<{ participantUid: string; isAdmin: boolean }> {
    const member = await this.membersService.findMemberByEmail(memberEmail);

    if (!member) {
      throw new ForbiddenException('No demo day access');
    }

    // Check if a user is a directory admin
    const isDirectoryAdmin = this.membersService.checkIfAdminUser(member);
    if (isDirectoryAdmin) {
      return { participantUid: member.uid, isAdmin: true };
    }

    // Check if a user is a demo day admin or founder with admin privileges
    const hasViewOnlyAdminAccess = await this.isDemoDayAdmin(member.uid, demoDayUid);
    if (hasViewOnlyAdminAccess) {
      return { participantUid: member.uid, isAdmin: true };
    }

    // Check if a user is a participant
    const participantAccess = await this.prisma.member.findUnique({
      where: { uid: member.uid },
      select: {
        demoDayParticipants: {
          where: {
            demoDayUid: demoDayUid,
            isDeleted: false,
            status: 'ENABLED',
          },
          select: { uid: true },
          take: 1,
        },
      },
    });

    if (participantAccess && participantAccess.demoDayParticipants.length > 0) {
      return { participantUid: member.uid, isAdmin: false };
    }

    // No access
    throw new ForbiddenException('No demo day access');
  }

  /**
   * Check if a member has admin access to a demo day
   * @param memberUid - UID of the member
   * @param demoDayUid - UID of the demo day
   * @returns True if the member has admin access
   */
  private async isDemoDayAdmin(memberUid: string, demoDayUid: string): Promise<boolean> {
    const participant = await this.prisma.demoDayParticipant.findFirst({
      where: {
        demoDayUid: demoDayUid,
        memberUid: memberUid,
        status: 'ENABLED',
        isDeleted: false,
      },
    });

    return participant?.isDemoDayAdmin || false;
  }
}

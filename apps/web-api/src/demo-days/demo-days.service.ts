import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';

type ExpressInterestStats = { liked: number; connected: number; invested: number; referral: number; total: number };

@Injectable()
export class DemoDaysService {
  constructor(private readonly prisma: PrismaService, private readonly analyticsService: AnalyticsService) {}

  async getCurrentDemoDay(): Promise<DemoDay | null> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: {
          in: [DemoDayStatus.UPCOMING, DemoDayStatus.EARLY_ACCESS, DemoDayStatus.ACTIVE, DemoDayStatus.COMPLETED],
        },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    return demoDay;
  }

  async getCurrentDemoDayAccess(memberEmail: string | null): Promise<{
    access: 'none' | 'INVESTOR' | 'FOUNDER';
    status: 'NONE' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
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
          accessLevel: {
            in: ['L5', 'L6'],
          },
          investorProfile: {
            type: { not: null },
          },
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

    if (!member) {
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
      title: string;
      description: string;
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

    const created = await this.prisma.demoDay.create({
      data: {
        startDate: data.startDate,
        title: data.title,
        description: data.description,
        status: data.status,
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
        startDate: created.startDate?.toISOString?.() || null,
        status: created.status,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
      },
    });

    return created;
  }

  async getAllDemoDays(): Promise<DemoDay[]> {
    return this.prisma.demoDay.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        uid: true,
        startDate: true,
        title: true,
        description: true,
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
        startDate: true,
        title: true,
        description: true,
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

  async updateDemoDay(
    uid: string,
    data: {
      startDate?: Date;
      title?: string;
      description?: string;
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
    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
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
        startDate: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    // Track "details updated" (name/description/startDate) only if any changed
    const detailsChanged: string[] = [];
    if (updateData.title !== undefined && before.title !== updated.title) detailsChanged.push('title');
    if (updateData.description !== undefined && before.description !== updated.description)
      detailsChanged.push('description');
    if (updateData.startDate !== undefined && before.startDate?.toISOString?.() !== updated.startDate?.toISOString?.())
      detailsChanged.push('startDate');

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
  ): 'UPCOMING' | 'ACTIVE' | 'COMPLETED' {
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
}

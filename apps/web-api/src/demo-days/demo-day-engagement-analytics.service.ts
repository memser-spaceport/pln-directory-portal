import { Injectable, ForbiddenException, NotFoundException, forwardRef, Inject, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';
import { ANALYTICS_EVENTS } from '../utils/constants';

// Event type arrays for SQL queries
const DD = ANALYTICS_EVENTS.DEMO_DAY_EVENT;

const ALL_ENGAGEMENT_EVENTS = [
  DD.TEAM_CARD_CLICKED,
  DD.PITCH_DECK_VIEWED,
  DD.PITCH_VIDEO_VIEWED,
  DD.LIKE_COMPANY_CLICKED,
  DD.CONNECT_COMPANY_CLICKED,
  DD.INVEST_COMPANY_CLICKED,
  DD.REFER_COMPANY_CLICKED,
  DD.INTRO_COMPANY_CLICKED,
  DD.INTRO_COMPANY_CONFIRM_CLICKED,
];

const CTA_CLICK_EVENTS = [
  DD.LIKE_COMPANY_CLICKED,
  DD.CONNECT_COMPANY_CLICKED,
  DD.INVEST_COMPANY_CLICKED,
  DD.REFER_COMPANY_CLICKED,
  DD.INTRO_COMPANY_CLICKED,
  DD.INTRO_COMPANY_CONFIRM_CLICKED,
];

@Injectable()
export class DemoDayEngagementAnalyticsService {
  private readonly logger = new Logger(DemoDayEngagementAnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => DemoDaysService))
    private readonly demoDaysService: DemoDaysService
  ) {}

  private async validateFounderAndGetProfileUid(
    memberEmail: string,
    demoDayUidOrSlug: string
  ): Promise<{ demoDayUid: string; teamFundraisingProfileUid: string }> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
            status: 'ENABLED',
            type: 'FOUNDER',
          },
          take: 1,
          select: { teamUid: true },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const founderParticipant = member.demoDayParticipants[0];
    if (!founderParticipant || !founderParticipant.teamUid) {
      throw new ForbiddenException('Only enabled founders can access engagement analytics');
    }

    const fundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: founderParticipant.teamUid,
          demoDayUid: demoDay.uid,
        },
      },
      select: { uid: true },
    });

    if (!fundraisingProfile) {
      throw new NotFoundException('Fundraising profile not found for this team and demo day');
    }

    return { demoDayUid: demoDay.uid, teamFundraisingProfileUid: fundraisingProfile.uid };
  }

  async getFounderEngagementStats(memberEmail: string, demoDayUidOrSlug: string) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateFounderAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug
    );

    // Run both queries in parallel: Event table stats + ExpressInterest stats (single query each)
    const [eventStats, interestStats] = await Promise.all([
      // Raw SQL on Event table for all frontend analytics event types (Demo Day related only)
      // Note: props.teamUid contains TeamFundraisingProfile.uid (unique per team+demoDay)
      // so filtering by it alone correctly scopes to the specific demo day
      this.prisma.$queryRaw<
        Array<{
          unique_investors: bigint;
          profile_views_total: bigint;
          profile_views_unique: bigint;
          deck_views_total: bigint;
          deck_views_unique: bigint;
          video_views_total: bigint;
          video_views_unique: bigint;
          cta_clicks_total: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" IN (${Prisma.join(ALL_ENGAGEMENT_EVENTS)}))
            AS unique_investors,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED})
            AS profile_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED})
            AS profile_views_unique,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_unique,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_unique,

          COUNT(*) FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)}))
            AS cta_clicks_total
        FROM "Event"
        WHERE "eventType" LIKE 'demo-day-active-view-%'
          AND props->>'teamUid' = ${teamFundraisingProfileUid}
      `,

      // Single query for all DemoDayExpressInterestStatistic aggregates
      // Filters by both demoDayUid and teamFundraisingProfileUid for explicit scoping
      this.prisma.$queryRaw<
        Array<{
          connections_total: bigint;
          investments_total: bigint;
          unique_connected: bigint;
          unique_invested: bigint;
        }>
      >`
        SELECT
          COALESCE(SUM("connectedCount"), 0) AS connections_total,
          COALESCE(SUM("investedCount"), 0) AS investments_total,
          COUNT(*) FILTER (WHERE connected = true) AS unique_connected,
          COUNT(*) FILTER (WHERE invested = true) AS unique_invested
        FROM "DemoDayExpressInterestStatistic"
        WHERE "demoDayUid" = ${demoDayUid}
          AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
      `,
    ]);

    const eventRow = eventStats[0];
    const uniqueInvestors = Number(eventRow?.unique_investors ?? 0);
    const profileViewsTotal = Number(eventRow?.profile_views_total ?? 0);
    const profileViewsUnique = Number(eventRow?.profile_views_unique ?? 0);
    const profileViewsRepeat = profileViewsTotal - profileViewsUnique;
    const deckViewsTotal = Number(eventRow?.deck_views_total ?? 0);
    const deckViewsUnique = Number(eventRow?.deck_views_unique ?? 0);
    const videoViewsTotal = Number(eventRow?.video_views_total ?? 0);
    const videoViewsUnique = Number(eventRow?.video_views_unique ?? 0);
    const ctaClicksTotal = Number(eventRow?.cta_clicks_total ?? 0);

    const interestRow = interestStats[0];
    const connectionsTotal = Number(interestRow?.connections_total ?? 0);
    const investmentsTotal = Number(interestRow?.investments_total ?? 0);
    const uniqueConnected = Number(interestRow?.unique_connected ?? 0);
    const uniqueInvested = Number(interestRow?.unique_invested ?? 0);

    const totalCtaInteractions = ctaClicksTotal + connectionsTotal + investmentsTotal;

    return {
      engagementOverview: {
        uniqueInvestors,
        profileViews: {
          total: profileViewsTotal,
          unique: profileViewsUnique,
          repeat: profileViewsRepeat,
        },
        totalCtaInteractions,
      },
      ctaPerformance: {
        profileViews: {
          total: profileViewsTotal,
          unique: profileViewsUnique,
          repeat: profileViewsRepeat,
        },
        viewedDeck: {
          total: deckViewsTotal,
          uniqueInvestors: deckViewsUnique,
        },
        watchedVideo: {
          total: videoViewsTotal,
          uniqueInvestors: videoViewsUnique,
        },
        connections: {
          total: connectionsTotal,
          uniqueInvestors: uniqueConnected,
        },
        investmentInterest: {
          total: investmentsTotal,
          uniqueInvestors: uniqueInvested,
        },
      },
    };
  }

  async getFounderEngagementTimeline(
    memberEmail: string,
    demoDayUidOrSlug: string,
    startDate?: string,
    endDate?: string
  ) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateFounderAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug
    );

    // Build optional date filter clauses for Event table
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;

    const [eventTimeline, interestTimeline] = await Promise.all([
      // Daily breakdown from Event table
      // Note: props.teamUid contains TeamFundraisingProfile.uid (unique per team+demoDay)
      this.prisma.$queryRaw<
        Array<{
          date: Date;
          profile_views: bigint;
          cta_interactions: bigint;
          unique_investors: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', ts)::date AS date,
          COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED})
            AS profile_views,
          COUNT(*) FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)}))
            AS cta_interactions,
          COUNT(DISTINCT "userId") AS unique_investors
        FROM "Event"
        WHERE "eventType" LIKE 'demo-day-active-view-%'
          AND props->>'teamUid' = ${teamFundraisingProfileUid}
          AND (${startDateObj}::timestamp IS NULL OR ts >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR ts < (${endDateObj}::timestamp + interval '1 day'))
        GROUP BY DATE_TRUNC('day', ts)::date
        ORDER BY date
      `,

      // Daily breakdown from DemoDayExpressInterestStatistic
      // Filters by both demoDayUid and teamFundraisingProfileUid for explicit scoping
      this.prisma.$queryRaw<
        Array<{
          date: Date;
          connections: bigint;
          investment_interest: bigint;
        }>
      >`
        SELECT
          DATE_TRUNC('day', "updatedAt")::date AS date,
          SUM("connectedCount") AS connections,
          SUM("investedCount") AS investment_interest
        FROM "DemoDayExpressInterestStatistic"
        WHERE "demoDayUid" = ${demoDayUid}
          AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
          AND (${startDateObj}::timestamp IS NULL OR "updatedAt" >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR "updatedAt" < (${endDateObj}::timestamp + interval '1 day'))
        GROUP BY DATE_TRUNC('day', "updatedAt")::date
        ORDER BY date
      `,
    ]);

    // Merge into date-keyed maps
    const overviewMap = new Map<string, { profileViews: number; ctaInteractions: number; uniqueInvestors: number }>();
    const ctaMap = new Map<string, { profileViews: number; connections: number; investmentInterest: number }>();

    for (const row of eventTimeline) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      overviewMap.set(dateStr, {
        profileViews: Number(row.profile_views),
        ctaInteractions: Number(row.cta_interactions),
        uniqueInvestors: Number(row.unique_investors),
      });
      ctaMap.set(dateStr, {
        profileViews: Number(row.profile_views),
        connections: 0,
        investmentInterest: 0,
      });
    }

    for (const row of interestTimeline) {
      const dateStr = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      const connections = Number(row.connections ?? 0);
      const investmentInterest = Number(row.investment_interest ?? 0);

      // Merge into overview (add connection + investment as CTA interactions)
      const existing = overviewMap.get(dateStr);
      if (existing) {
        existing.ctaInteractions += connections + investmentInterest;
      } else {
        overviewMap.set(dateStr, {
          profileViews: 0,
          ctaInteractions: connections + investmentInterest,
          uniqueInvestors: 0,
        });
      }

      // Merge into CTA map
      const existingCta = ctaMap.get(dateStr);
      if (existingCta) {
        existingCta.connections = connections;
        existingCta.investmentInterest = investmentInterest;
      } else {
        ctaMap.set(dateStr, {
          profileViews: 0,
          connections,
          investmentInterest,
        });
      }
    }

    // Sort by date and build arrays
    const sortedOverviewDates = [...overviewMap.keys()].sort();
    const sortedCtaDates = [...ctaMap.keys()].sort();

    const engagementOverview = sortedOverviewDates.map((date) => ({
      date,
      ...overviewMap.get(date)!,
    }));

    const ctaPerformance = sortedCtaDates.map((date) => ({
      date,
      ...ctaMap.get(date)!,
    }));

    return { engagementOverview, ctaPerformance };
  }
}

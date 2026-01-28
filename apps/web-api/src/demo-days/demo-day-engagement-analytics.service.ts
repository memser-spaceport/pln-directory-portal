import { ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
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

    const engagementOverview = sortedOverviewDates.map((date) => {
      const data = overviewMap.get(date);
      return {
        date,
        profileViews: data?.profileViews ?? 0,
        ctaInteractions: data?.ctaInteractions ?? 0,
        uniqueInvestors: data?.uniqueInvestors ?? 0,
      };
    });

    const ctaPerformance = sortedCtaDates.map((date) => {
      const data = ctaMap.get(date);
      return {
        date,
        profileViews: data?.profileViews ?? 0,
        connections: data?.connections ?? 0,
        investmentInterest: data?.investmentInterest ?? 0,
      };
    });

    return { engagementOverview, ctaPerformance };
  }

  async getInvestorActivity(
    memberEmail: string,
    demoDayUidOrSlug: string,
    options: {
      page: number;
      limit: number;
      sortBy: 'lastActivity' | 'totalInteractions' | 'name';
      sortOrder: 'asc' | 'desc';
    }
  ) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateFounderAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug
    );

    const { page, limit, sortBy, sortOrder } = options;
    const offset = (page - 1) * limit;

    // Get investor activity aggregated per investor from Event table
    // Note: props.teamUid contains TeamFundraisingProfile.uid
    const investorEvents = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        profile_views: bigint;
        deck_views: bigint;
        video_views: bigint;
        cta_clicks: bigint;
        total_interactions: bigint;
        first_activity: Date;
        last_activity: Date;
      }>
    >`
      SELECT
        "userId" AS user_id,
        COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED}) AS profile_views,
        COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED}) AS deck_views,
        COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED}) AS video_views,
        COUNT(*) FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)})) AS cta_clicks,
        COUNT(*) AS total_interactions,
        MIN(ts) AS first_activity,
        MAX(ts) AS last_activity
      FROM "Event"
      WHERE "eventType" LIKE 'demo-day-active-view-%'
        AND props->>'teamUid' = ${teamFundraisingProfileUid}
        AND "userId" IS NOT NULL
      GROUP BY "userId"
    `;

    // Get interest data from DemoDayExpressInterestStatistic
    const interestStats = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: {
        demoDayUid,
        teamFundraisingProfileUid,
      },
      select: {
        memberUid: true,
        connected: true,
        invested: true,
        liked: true,
        referral: true,
        connectedCount: true,
        investedCount: true,
        likedCount: true,
        referralCount: true,
        updatedAt: true,
      },
    });

    // Create a map of memberUid to interest stats
    const interestMap = new Map(interestStats.map((s) => [s.memberUid, s]));

    // Get all unique investor member UIDs
    const allInvestorUids = new Set<string>();
    investorEvents.forEach((e) => allInvestorUids.add(e.user_id));
    interestStats.forEach((s) => allInvestorUids.add(s.memberUid));

    // Fetch member details and investor profiles for all investors
    const members = await this.prisma.member.findMany({
      where: { uid: { in: Array.from(allInvestorUids) } },
      select: {
        uid: true,
        name: true,
        email: true,
        image: { select: { url: true } },
        investorProfile: {
          select: {
            type: true,
            investmentFocus: true,
            investInStartupStages: true,
            typicalCheckSize: true,
          },
        },
      },
    });
    const memberMap = new Map(members.map((m) => [m.uid, m]));

    // Merge event data and interest data per investor
    const eventMap = new Map(investorEvents.map((e) => [e.user_id, e]));
    const investorData: Array<{
      memberUid: string;
      name: string;
      email: string;
      imageUrl: string | null;
      investorProfile: {
        type: string | null;
        investmentFocus: string[];
        investInStartupStages: string[];
        typicalCheckSize: number | null;
      } | null;
      profileViews: number;
      deckViews: number;
      videoViews: number;
      ctaClicks: number;
      connected: boolean;
      invested: boolean;
      liked: boolean;
      totalInteractions: number;
      firstActivity: Date | null;
      lastActivity: Date | null;
    }> = [];

    for (const uid of allInvestorUids) {
      const event = eventMap.get(uid);
      const interest = interestMap.get(uid);
      const member = memberMap.get(uid);

      const profileViews = Number(event?.profile_views ?? 0);
      const deckViews = Number(event?.deck_views ?? 0);
      const videoViews = Number(event?.video_views ?? 0);
      const ctaClicks = Number(event?.cta_clicks ?? 0);
      const connectCount = interest?.connectedCount ?? 0;
      const investCount = interest?.investedCount ?? 0;
      const likeCount = interest?.likedCount ?? 0;

      const totalInteractions =
        profileViews + deckViews + videoViews + ctaClicks + connectCount + investCount + likeCount;

      // Determine last activity from both sources
      const eventLastActivity = event?.last_activity ? new Date(event.last_activity) : null;
      const interestLastActivity = interest?.updatedAt ? new Date(interest.updatedAt) : null;
      let lastActivity: Date | null = null;
      if (eventLastActivity && interestLastActivity) {
        lastActivity = eventLastActivity > interestLastActivity ? eventLastActivity : interestLastActivity;
      } else {
        lastActivity = eventLastActivity || interestLastActivity;
      }

      investorData.push({
        memberUid: uid,
        name: member?.name ?? 'Unknown',
        email: member?.email ?? '',
        imageUrl: member?.image?.url ?? null,
        investorProfile: member?.investorProfile
          ? {
              type: member.investorProfile.type,
              investmentFocus: member.investorProfile.investmentFocus,
              investInStartupStages: member.investorProfile.investInStartupStages,
              typicalCheckSize: member.investorProfile.typicalCheckSize,
            }
          : null,
        profileViews,
        deckViews,
        videoViews,
        ctaClicks,
        connected: interest?.connected ?? false,
        invested: interest?.invested ?? false,
        liked: interest?.liked ?? false,
        totalInteractions,
        firstActivity: event?.first_activity ? new Date(event.first_activity) : null,
        lastActivity,
      });
    }

    // Sort based on options
    investorData.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'lastActivity':
          const aTime = a.lastActivity?.getTime() ?? 0;
          const bTime = b.lastActivity?.getTime() ?? 0;
          comparison = aTime - bTime;
          break;
        case 'totalInteractions':
          comparison = a.totalInteractions - b.totalInteractions;
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = investorData.length;
    const paginatedData = investorData.slice(offset, offset + limit);

    return {
      data: paginatedData.map((inv) => ({
        member: {
          uid: inv.memberUid,
          name: inv.name,
          imageUrl: inv.imageUrl,
        },
        investorProfile: inv.investorProfile,
        engagement: {
          profileViews: inv.profileViews,
          deckViews: inv.deckViews,
          videoViews: inv.videoViews,
          ctaClicks: inv.ctaClicks,
        },
        interest: {
          connected: inv.connected,
          invested: inv.invested,
          liked: inv.liked,
        },
        totalInteractions: inv.totalInteractions,
        lastActivity: inv.lastActivity?.toISOString() ?? null,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getInvestorEngagementFunnel(memberEmail: string, demoDayUidOrSlug: string) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateFounderAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug
    );

    // Get funnel stages from Event table (unique investors at each stage)
    // Note: props.teamUid contains TeamFundraisingProfile.uid
    const [funnelStats, interestStats] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{
          profile_opened: bigint;
          deck_opened: bigint;
          video_started: bigint;
          cta_clicked: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED})
            AS profile_opened,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_opened,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_started,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)}))
            AS cta_clicked
        FROM "Event"
        WHERE "eventType" LIKE 'demo-day-active-view-%'
          AND props->>'teamUid' = ${teamFundraisingProfileUid}
          AND "userId" IS NOT NULL
      `,

      // Get interest funnel (unique investors who connected/invested)
      this.prisma.$queryRaw<
        Array<{
          unique_connected: bigint;
          unique_invested: bigint;
        }>
      >`
        SELECT
          COUNT(*) FILTER (WHERE connected = true) AS unique_connected,
          COUNT(*) FILTER (WHERE invested = true) AS unique_invested
        FROM "DemoDayExpressInterestStatistic"
        WHERE "demoDayUid" = ${demoDayUid}
          AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
      `,
    ]);

    const funnelRow = funnelStats[0];
    const interestRow = interestStats[0];

    const profileOpened = Number(funnelRow?.profile_opened ?? 0);
    const deckOpened = Number(funnelRow?.deck_opened ?? 0);
    const videoStarted = Number(funnelRow?.video_started ?? 0);
    const ctaClicked = Number(funnelRow?.cta_clicked ?? 0);
    const connected = Number(interestRow?.unique_connected ?? 0);
    const invested = Number(interestRow?.unique_invested ?? 0);

    // Calculate conversion rates (from profile opened as baseline)
    const calcRate = (value: number, baseline: number) =>
      baseline > 0 ? Math.round((value / baseline) * 100 * 10) / 10 : 0;

    return {
      funnel: [
        {
          stage: 'profileOpened',
          label: 'Profile Opened',
          uniqueInvestors: profileOpened,
          conversionRate: 100,
        },
        {
          stage: 'deckOpened',
          label: 'Deck Opened',
          uniqueInvestors: deckOpened,
          conversionRate: calcRate(deckOpened, profileOpened),
        },
        {
          stage: 'videoStarted',
          label: 'Video Started',
          uniqueInvestors: videoStarted,
          conversionRate: calcRate(videoStarted, profileOpened),
        },
        {
          stage: 'ctaClicked',
          label: 'CTA Clicked',
          uniqueInvestors: ctaClicked,
          conversionRate: calcRate(ctaClicked, profileOpened),
        },
        {
          stage: 'connected',
          label: 'Connected',
          uniqueInvestors: connected,
          conversionRate: calcRate(connected, profileOpened),
        },
        {
          stage: 'invested',
          label: 'Investment Interest',
          uniqueInvestors: invested,
          conversionRate: calcRate(invested, profileOpened),
        },
      ],
    };
  }
}

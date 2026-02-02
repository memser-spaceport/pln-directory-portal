import { ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { MemberRole } from '../../../back-office/utils/constants';

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

  private async validateAndGetProfileUid(
    memberEmail: string,
    demoDayUidOrSlug: string,
    requestedProfileUid?: string
  ): Promise<{ demoDayUid: string; teamFundraisingProfileUid: string }> {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        memberRoles: { select: { name: true } },
        demoDayAdminScopes: {
          select: { scopeType: true, scopeValue: true },
        },
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
          },
          take: 1,
          select: {
            teamUid: true,
            type: true,
            status: true,
          },
        },
      },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    // Check if dashboard is enabled for this demo day
    if (!demoDay.dashboardEnabled) {
      throw new ForbiddenException('Dashboard access is not enabled for this Demo Day');
    }

    // Check admin roles
    const isDirectoryAdmin = member.memberRoles.some((r) => r.name === MemberRole.DIRECTORY_ADMIN);
    const isDemoDayAdmin = member.memberRoles.some((r) => r.name === MemberRole.DEMO_DAY_ADMIN);

    // Check admin scopes
    const hasHostScope = member.demoDayAdminScopes?.some(
      (s) => s.scopeType === 'HOST' && s.scopeValue.toLowerCase() === demoDay.host.toLowerCase()
    );
    const hasWhitelistAll = member.demoDayAdminScopes?.some(
      (s) => s.scopeType === 'DASHBOARD_WHITELIST' && s.scopeValue === '*'
    );
    const hasWhitelistHost = member.demoDayAdminScopes?.some(
      (s) => s.scopeType === 'DASHBOARD_WHITELIST' && s.scopeValue.toLowerCase() === demoDay.host.toLowerCase()
    );

    // Determine access level
    const isAdmin = isDirectoryAdmin || (isDemoDayAdmin && hasHostScope) || hasWhitelistAll || hasWhitelistHost;

    // Get user's participant record for this demo day
    const participant = member.demoDayParticipants[0];

    // Check if user is an enabled founder
    const isEnabledFounder = participant?.type === 'FOUNDER' && participant?.status === 'ENABLED';

    // --- ADMIN PATH ---
    if (isAdmin) {
      if (!requestedProfileUid) {
        throw new ForbiddenException('Admin users must specify teamFundraisingProfileUid query parameter');
      }

      // Validate the requested profile exists and belongs to this demo day
      const profile = await this.prisma.teamFundraisingProfile.findFirst({
        where: {
          uid: requestedProfileUid,
          demoDayUid: demoDay.uid,
        },
        select: { uid: true },
      });

      if (!profile) {
        throw new NotFoundException('TeamFundraisingProfile not found for this demo day');
      }

      return { demoDayUid: demoDay.uid, teamFundraisingProfileUid: profile.uid };
    }

    // --- FOUNDER PATH ---
    if (isEnabledFounder && participant?.teamUid) {
      const profile = await this.prisma.teamFundraisingProfile.findUnique({
        where: {
          teamUid_demoDayUid: {
            teamUid: participant.teamUid,
            demoDayUid: demoDay.uid,
          },
        },
        select: { uid: true },
      });

      if (!profile) {
        throw new NotFoundException('Fundraising profile not found for your team');
      }

      return { demoDayUid: demoDay.uid, teamFundraisingProfileUid: profile.uid };
    }

    // --- NO ACCESS ---
    throw new ForbiddenException('Only admins or enabled founders can access engagement analytics');
  }

  async getFounderEngagementStats(
    memberEmail: string,
    demoDayUidOrSlug: string,
    requestedProfileUid?: string,
    startDate?: string,
    endDate?: string
  ) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug,
      requestedProfileUid
    );

    // Build optional date filter clauses
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;

    // Run both queries in parallel: Event table stats + ExpressInterest stats (single query each)
    const [eventStats, interestStats] = await Promise.all([
      // Raw SQL on Event table for all frontend analytics event types (Demo Day related only)
      // Note: props.teamUid contains TeamFundraisingProfile.uid (unique per team+demoDay)
      // so filtering by it alone correctly scopes to the specific demo day
      this.prisma.$queryRaw<
        Array<{
          unique_investors: bigint;
          deck_views_total: bigint;
          deck_views_unique: bigint;
          video_views_total: bigint;
          video_views_unique: bigint;
          cta_clicks_total: bigint;
          cta_clicks_unique: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" IN (${Prisma.join(ALL_ENGAGEMENT_EVENTS)}))
            AS unique_investors,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_unique,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_unique,

          COUNT(*) FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)}))
            AS cta_clicks_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" IN (${Prisma.join(CTA_CLICK_EVENTS)}))
            AS cta_clicks_unique
        FROM "Event"
        WHERE "eventType" LIKE 'demo-day-active-view-%'
          AND props->>'teamUid' = ${teamFundraisingProfileUid}
          AND (${startDateObj}::timestamp IS NULL OR ts >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR ts < (${endDateObj}::timestamp + interval '1 day'))
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
          AND (${startDateObj}::timestamp IS NULL OR "createdAt" >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR "createdAt" < (${endDateObj}::timestamp + interval '1 day'))
      `,
    ]);

    const eventRow = eventStats[0];
    const uniqueInvestors = Number(eventRow?.unique_investors ?? 0);
    const deckViewsTotal = Number(eventRow?.deck_views_total ?? 0);
    const deckViewsUnique = Number(eventRow?.deck_views_unique ?? 0);
    const videoViewsTotal = Number(eventRow?.video_views_total ?? 0);
    const videoViewsUnique = Number(eventRow?.video_views_unique ?? 0);
    const ctaClicksTotal = Number(eventRow?.cta_clicks_total ?? 0);
    const ctaClicksUnique = Number(eventRow?.cta_clicks_unique ?? 0);

    const interestRow = interestStats[0];
    const connectionsTotal = Number(interestRow?.connections_total ?? 0);
    const investmentsTotal = Number(interestRow?.investments_total ?? 0);
    const uniqueConnected = Number(interestRow?.unique_connected ?? 0);
    const uniqueInvested = Number(interestRow?.unique_invested ?? 0);

    const totalCtaInteractions = ctaClicksTotal + connectionsTotal + investmentsTotal;

    return {
      uniqueInvestors,
      totalCtaInteractions: {
        total: totalCtaInteractions,
        uniqueInvestors: ctaClicksUnique,
      },
      viewedSlide: {
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
    };
  }

  async getFounderEngagementTimeline(
    memberEmail: string,
    demoDayUidOrSlug: string,
    startDate?: string,
    endDate?: string,
    requestedProfileUid?: string,
    aggregation: 'hour' | 'day' = 'day'
  ) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug,
      requestedProfileUid
    );

    // Build optional date filter clauses for Event table
    const startDateObj = startDate ? new Date(startDate) : null;
    const endDateObj = endDate ? new Date(endDate) : null;

    // All event types for timeline (including landing page events)
    const allTimelineEvents = [
      DD.TEAM_CARD_VIEWED,
      DD.TEAM_CARD_CLICKED,
      DD.PITCH_DECK_VIEWED,
      DD.PITCH_VIDEO_VIEWED,
      DD.LANDING_TEAM_CARD_CLICKED,
      DD.LANDING_TEAM_WEBSITE_CLICKED,
      DD.INTRO_COMPANY_CONFIRM_CLICKED,
    ];

    const [eventTimeline, interestTimeline] = await Promise.all([
      // Aggregated breakdown from Event table
      // Note: props.teamUid contains TeamFundraisingProfile.uid (unique per team+demoDay)
      aggregation === 'hour'
        ? this.prisma.$queryRaw<
            Array<{
              period: Date;
              profile_viewed: bigint;
              viewed_slide: bigint;
              video_watched: bigint;
              founder_profile_clicked: bigint;
              team_page_clicked: bigint;
              team_website_clicked: bigint;
              intro_made: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('hour', ts) AS period,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_VIEWED}) AS profile_viewed,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED}) AS viewed_slide,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED}) AS video_watched,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED}) AS founder_profile_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_CARD_CLICKED}) AS team_page_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_WEBSITE_CLICKED}) AS team_website_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.INTRO_COMPANY_CONFIRM_CLICKED}) AS intro_made
            FROM "Event"
            WHERE "eventType" IN (${Prisma.join(allTimelineEvents)})
              AND props->>'teamUid' = ${teamFundraisingProfileUid}
              AND (${startDateObj}::timestamp IS NULL OR ts >= ${startDateObj}::timestamp)
              AND (${endDateObj}::timestamp IS NULL OR ts < (${endDateObj}::timestamp + interval '1 day'))
            GROUP BY DATE_TRUNC('hour', ts)
            ORDER BY period
          `
        : this.prisma.$queryRaw<
            Array<{
              period: Date;
              profile_viewed: bigint;
              viewed_slide: bigint;
              video_watched: bigint;
              founder_profile_clicked: bigint;
              team_page_clicked: bigint;
              team_website_clicked: bigint;
              intro_made: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('day', ts)::date AS period,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_VIEWED}) AS profile_viewed,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED}) AS viewed_slide,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED}) AS video_watched,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED}) AS founder_profile_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_CARD_CLICKED}) AS team_page_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_WEBSITE_CLICKED}) AS team_website_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.INTRO_COMPANY_CONFIRM_CLICKED}) AS intro_made
            FROM "Event"
            WHERE "eventType" IN (${Prisma.join(allTimelineEvents)})
              AND props->>'teamUid' = ${teamFundraisingProfileUid}
              AND (${startDateObj}::timestamp IS NULL OR ts >= ${startDateObj}::timestamp)
              AND (${endDateObj}::timestamp IS NULL OR ts < (${endDateObj}::timestamp + interval '1 day'))
            GROUP BY DATE_TRUNC('day', ts)::date
            ORDER BY period
          `,

      // Aggregated breakdown from DemoDayExpressInterestStatistic
      // Filters by both demoDayUid and teamFundraisingProfileUid for explicit scoping
      aggregation === 'hour'
        ? this.prisma.$queryRaw<
            Array<{
              period: Date;
              liked: bigint;
              connected: bigint;
              investment_interest: bigint;
              feedback_given: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('hour', "updatedAt") AS period,
              SUM("likedCount") AS liked,
              SUM("connectedCount") AS connected,
              SUM("investedCount") AS investment_interest,
              SUM("feedbackCount") AS feedback_given
            FROM "DemoDayExpressInterestStatistic"
            WHERE "demoDayUid" = ${demoDayUid}
              AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
              AND (${startDateObj}::timestamp IS NULL OR "updatedAt" >= ${startDateObj}::timestamp)
              AND (${endDateObj}::timestamp IS NULL OR "updatedAt" < (${endDateObj}::timestamp + interval '1 day'))
            GROUP BY DATE_TRUNC('hour', "updatedAt")
            ORDER BY period
          `
        : this.prisma.$queryRaw<
            Array<{
              period: Date;
              liked: bigint;
              connected: bigint;
              investment_interest: bigint;
              feedback_given: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('day', "updatedAt")::date AS period,
              SUM("likedCount") AS liked,
              SUM("connectedCount") AS connected,
              SUM("investedCount") AS investment_interest,
              SUM("feedbackCount") AS feedback_given
            FROM "DemoDayExpressInterestStatistic"
            WHERE "demoDayUid" = ${demoDayUid}
              AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
              AND (${startDateObj}::timestamp IS NULL OR "updatedAt" >= ${startDateObj}::timestamp)
              AND (${endDateObj}::timestamp IS NULL OR "updatedAt" < (${endDateObj}::timestamp + interval '1 day'))
            GROUP BY DATE_TRUNC('day', "updatedAt")::date
            ORDER BY period
          `,
    ]);

    // Merge into single date-keyed map
    const timelineMap = new Map<
      string,
      {
        profileViewed: number;
        viewedSlide: number;
        videoWatched: number;
        founderProfileClicked: number;
        teamPageClicked: number;
        teamWebsiteClicked: number;
        liked: number;
        connected: number;
        investmentInterest: number;
        introMade: number;
        feedbackGiven: number;
      }
    >();

    const formatDate = (date: Date | string): string => {
      if (date instanceof Date) {
        return aggregation === 'hour' ? date.toISOString() : date.toISOString().split('T')[0];
      }
      return String(date);
    };

    for (const row of eventTimeline) {
      const dateStr = formatDate(row.period);
      timelineMap.set(dateStr, {
        profileViewed: Number(row.profile_viewed ?? 0),
        viewedSlide: Number(row.viewed_slide ?? 0),
        videoWatched: Number(row.video_watched ?? 0),
        founderProfileClicked: Number(row.founder_profile_clicked ?? 0),
        teamPageClicked: Number(row.team_page_clicked ?? 0),
        teamWebsiteClicked: Number(row.team_website_clicked ?? 0),
        liked: 0,
        connected: 0,
        investmentInterest: 0,
        introMade: Number(row.intro_made ?? 0),
        feedbackGiven: 0,
      });
    }

    for (const row of interestTimeline) {
      const dateStr = formatDate(row.period);
      const liked = Number(row.liked ?? 0);
      const connected = Number(row.connected ?? 0);
      const investmentInterest = Number(row.investment_interest ?? 0);
      const feedbackGiven = Number(row.feedback_given ?? 0);

      const existing = timelineMap.get(dateStr);
      if (existing) {
        existing.liked = liked;
        existing.connected = connected;
        existing.investmentInterest = investmentInterest;
        existing.feedbackGiven = feedbackGiven;
      } else {
        timelineMap.set(dateStr, {
          profileViewed: 0,
          viewedSlide: 0,
          videoWatched: 0,
          founderProfileClicked: 0,
          teamPageClicked: 0,
          teamWebsiteClicked: 0,
          liked,
          connected,
          investmentInterest,
          introMade: 0,
          feedbackGiven,
        });
      }
    }

    // Sort by date and build array
    const sortedDates = [...timelineMap.keys()].sort();

    const timeline = sortedDates.map((date) => {
      const data = timelineMap.get(date);
      return {
        date,
        profileViewed: data?.profileViewed ?? 0,
        viewedSlide: data?.viewedSlide ?? 0,
        videoWatched: data?.videoWatched ?? 0,
        founderProfileClicked: data?.founderProfileClicked ?? 0,
        teamPageClicked: data?.teamPageClicked ?? 0,
        teamWebsiteClicked: data?.teamWebsiteClicked ?? 0,
        liked: data?.liked ?? 0,
        connected: data?.connected ?? 0,
        investmentInterest: data?.investmentInterest ?? 0,
        introMade: data?.introMade ?? 0,
        feedbackGiven: data?.feedbackGiven ?? 0,
      };
    });

    return timeline;
  }

  async getInvestorActivity(
    memberEmail: string,
    demoDayUidOrSlug: string,
    options: {
      page: number;
      limit: number;
      sortBy: 'lastActivity' | 'totalInteractions' | 'name';
      sortOrder: 'asc' | 'desc';
    },
    requestedProfileUid?: string
  ) {
    const { demoDayUid, teamFundraisingProfileUid } = await this.validateAndGetProfileUid(
      memberEmail,
      demoDayUidOrSlug,
      requestedProfileUid
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
      founderProfileClicks: number;
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

      const founderProfileClicks = Number(event?.profile_views ?? 0);
      const deckViews = Number(event?.deck_views ?? 0);
      const videoViews = Number(event?.video_views ?? 0);
      const ctaClicks = Number(event?.cta_clicks ?? 0);
      const connectCount = interest?.connectedCount ?? 0;
      const investCount = interest?.investedCount ?? 0;
      const likeCount = interest?.likedCount ?? 0;

      const totalInteractions =
        founderProfileClicks + deckViews + videoViews + ctaClicks + connectCount + investCount + likeCount;

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
        founderProfileClicks,
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
          founderProfileClicks: inv.founderProfileClicks,
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

}

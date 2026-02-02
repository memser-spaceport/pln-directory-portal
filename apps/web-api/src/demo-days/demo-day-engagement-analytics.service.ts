import { ForbiddenException, forwardRef, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { MemberRole } from '../../../back-office/utils/constants';

// Event type arrays for SQL queries
const DD = ANALYTICS_EVENTS.DEMO_DAY_EVENT;

// Event types for engagement stats (Event table only - CTA metrics come from DemoDayExpressInterestStatistic)
const ENGAGEMENT_VIEW_EVENTS = [DD.TEAM_CARD_CLICKED, DD.PITCH_DECK_VIEWED, DD.PITCH_VIDEO_VIEWED];

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
      // Event table: view metrics only (CTA metrics come from DemoDayExpressInterestStatistic)
      // Note: props.teamUid contains TeamFundraisingProfile.uid (unique per team+demoDay)
      this.prisma.$queryRaw<
        Array<{
          unique_investors: bigint;
          deck_views_total: bigint;
          deck_views_unique: bigint;
          video_views_total: bigint;
          video_views_unique: bigint;
        }>
      >`
        SELECT
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" IN (${Prisma.join(ENGAGEMENT_VIEW_EVENTS)}))
            AS unique_investors,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED})
            AS deck_views_unique,

          COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_total,
          COUNT(DISTINCT "userId") FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED})
            AS video_views_unique
        FROM "Event"
        WHERE "eventType" LIKE 'demo-day-active-view-%'
          AND props->>'teamUid' = ${teamFundraisingProfileUid}
          AND (${startDateObj}::timestamp IS NULL OR ts >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR ts < (${endDateObj}::timestamp + interval '1 day'))
      `,

      // DemoDayExpressInterestStatistic: all CTA metrics (liked, connected, invested, referral, feedback)
      // This is the source of truth for CTA interactions
      this.prisma.$queryRaw<
        Array<{
          unique_investors: bigint;
          liked_total: bigint;
          liked_unique: bigint;
          connected_total: bigint;
          connected_unique: bigint;
          invested_total: bigint;
          invested_unique: bigint;
          referral_total: bigint;
          referral_unique: bigint;
          feedback_total: bigint;
          feedback_unique: bigint;
        }>
      >`
        SELECT
          COUNT(*) AS unique_investors,
          COALESCE(SUM("likedCount"), 0) AS liked_total,
          COUNT(*) FILTER (WHERE liked = true) AS liked_unique,
          COALESCE(SUM("connectedCount"), 0) AS connected_total,
          COUNT(*) FILTER (WHERE connected = true) AS connected_unique,
          COALESCE(SUM("investedCount"), 0) AS invested_total,
          COUNT(*) FILTER (WHERE invested = true) AS invested_unique,
          COALESCE(SUM("referralCount"), 0) AS referral_total,
          COUNT(*) FILTER (WHERE referral = true) AS referral_unique,
          COALESCE(SUM("feedbackCount"), 0) AS feedback_total,
          COUNT(*) FILTER (WHERE feedback = true) AS feedback_unique
        FROM "DemoDayExpressInterestStatistic"
        WHERE "demoDayUid" = ${demoDayUid}
          AND "teamFundraisingProfileUid" = ${teamFundraisingProfileUid}
          AND (${startDateObj}::timestamp IS NULL OR "createdAt" >= ${startDateObj}::timestamp)
          AND (${endDateObj}::timestamp IS NULL OR "createdAt" < (${endDateObj}::timestamp + interval '1 day'))
      `,
    ]);

    const eventRow = eventStats[0];
    const eventUniqueInvestors = Number(eventRow?.unique_investors ?? 0);
    const deckViewsTotal = Number(eventRow?.deck_views_total ?? 0);
    const deckViewsUnique = Number(eventRow?.deck_views_unique ?? 0);
    const videoViewsTotal = Number(eventRow?.video_views_total ?? 0);
    const videoViewsUnique = Number(eventRow?.video_views_unique ?? 0);

    const interestRow = interestStats[0];
    const interestUniqueInvestors = Number(interestRow?.unique_investors ?? 0);
    const likedTotal = Number(interestRow?.liked_total ?? 0);
    const connectedTotal = Number(interestRow?.connected_total ?? 0);
    const connectedUnique = Number(interestRow?.connected_unique ?? 0);
    const investedTotal = Number(interestRow?.invested_total ?? 0);
    const investedUnique = Number(interestRow?.invested_unique ?? 0);
    const referralTotal = Number(interestRow?.referral_total ?? 0);
    const feedbackTotal = Number(interestRow?.feedback_total ?? 0);

    // Total CTA interactions = sum of all CTA types from DemoDayExpressInterestStatistic
    const totalCtaInteractions = likedTotal + connectedTotal + investedTotal + referralTotal + feedbackTotal;
    // For unique investors in CTAs, we use the count from DemoDayExpressInterestStatistic
    const totalCtaUniqueInvestors = interestUniqueInvestors;

    // Unique investors = max of event-based and interest-based (they may overlap)
    // Using event-based as primary since it captures more interaction types
    const uniqueInvestors = Math.max(eventUniqueInvestors, interestUniqueInvestors);

    return {
      uniqueInvestors,
      totalCtaInteractions: {
        total: totalCtaInteractions,
        uniqueInvestors: totalCtaUniqueInvestors,
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
        total: connectedTotal,
        uniqueInvestors: connectedUnique,
      },
      investmentInterest: {
        total: investedTotal,
        uniqueInvestors: investedUnique,
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
    // Note: liked, connected, invested, introMade (referral), feedbackGiven come from DemoDayExpressInterestStatistic
    const allTimelineEvents = [
      DD.TEAM_CARD_VIEWED,
      DD.TEAM_CARD_CLICKED,
      DD.PITCH_DECK_VIEWED,
      DD.PITCH_VIDEO_VIEWED,
      DD.LANDING_TEAM_CARD_CLICKED,
      DD.LANDING_TEAM_WEBSITE_CLICKED,
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
            }>
          >`
            SELECT
              DATE_TRUNC('hour', ts) AS period,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_VIEWED}) AS profile_viewed,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED}) AS viewed_slide,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED}) AS video_watched,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED}) AS founder_profile_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_CARD_CLICKED}) AS team_page_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_WEBSITE_CLICKED}) AS team_website_clicked
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
            }>
          >`
            SELECT
              DATE_TRUNC('day', ts)::date AS period,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_VIEWED}) AS profile_viewed,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_DECK_VIEWED}) AS viewed_slide,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.PITCH_VIDEO_VIEWED}) AS video_watched,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.TEAM_CARD_CLICKED}) AS founder_profile_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_CARD_CLICKED}) AS team_page_clicked,
              COUNT(*) FILTER (WHERE "eventType" = ${DD.LANDING_TEAM_WEBSITE_CLICKED}) AS team_website_clicked
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
              intro_made: bigint;
              feedback_given: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('hour', "updatedAt") AS period,
              SUM("likedCount") AS liked,
              SUM("connectedCount") AS connected,
              SUM("investedCount") AS investment_interest,
              SUM("referralCount") AS intro_made,
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
              intro_made: bigint;
              feedback_given: bigint;
            }>
          >`
            SELECT
              DATE_TRUNC('day', "updatedAt")::date AS period,
              SUM("likedCount") AS liked,
              SUM("connectedCount") AS connected,
              SUM("investedCount") AS investment_interest,
              SUM("referralCount") AS intro_made,
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
        introMade: 0,
        feedbackGiven: 0,
      });
    }

    for (const row of interestTimeline) {
      const dateStr = formatDate(row.period);
      const liked = Number(row.liked ?? 0);
      const connected = Number(row.connected ?? 0);
      const investmentInterest = Number(row.investment_interest ?? 0);
      const introMade = Number(row.intro_made ?? 0);
      const feedbackGiven = Number(row.feedback_given ?? 0);

      const existing = timelineMap.get(dateStr);
      if (existing) {
        existing.liked = liked;
        existing.connected = connected;
        existing.investmentInterest = investmentInterest;
        existing.introMade = introMade;
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
          introMade,
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

    // Interaction types matching the timeline endpoint
    type InteractionType =
      | 'profileViewed'
      | 'viewedSlide'
      | 'videoWatched'
      | 'founderProfileClicked'
      | 'teamPageClicked'
      | 'teamWebsiteClicked'
      | 'liked'
      | 'connected'
      | 'invested'
      | 'introMade'
      | 'feedbackGiven';

    // Map event types to interaction types (only for Event table interactions)
    // Note: liked, connected, invested, introMade, feedbackGiven come from DemoDayExpressInterestStatistic
    const eventTypeToInteraction: Record<string, InteractionType> = {
      [DD.TEAM_CARD_VIEWED]: 'profileViewed',
      [DD.PITCH_DECK_VIEWED]: 'viewedSlide',
      [DD.PITCH_VIDEO_VIEWED]: 'videoWatched',
      [DD.TEAM_CARD_CLICKED]: 'founderProfileClicked',
      [DD.LANDING_TEAM_CARD_CLICKED]: 'teamPageClicked',
      [DD.LANDING_TEAM_WEBSITE_CLICKED]: 'teamWebsiteClicked',
    };

    // Get individual events from Event table (one row per event)
    const relevantEventTypes = Object.keys(eventTypeToInteraction);
    const individualEvents = await this.prisma.$queryRaw<
      Array<{
        user_id: string;
        event_type: string;
        event_ts: Date;
      }>
    >`
      SELECT
        "userId" AS user_id,
        "eventType" AS event_type,
        ts AS event_ts
      FROM "Event"
      WHERE "eventType" IN (${Prisma.join(relevantEventTypes)})
        AND props->>'teamUid' = ${teamFundraisingProfileUid}
        AND "userId" IS NOT NULL
      ORDER BY ts DESC
    `;

    // Get interest data from DemoDayExpressInterestStatistic (for liked, connected, invested, introMade, feedbackGiven)
    const interestStats = await this.prisma.demoDayExpressInterestStatistic.findMany({
      where: {
        demoDayUid,
        teamFundraisingProfileUid,
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

    // Collect all unique investor UIDs
    const allInvestorUids = new Set<string>();
    individualEvents.forEach((e) => allInvestorUids.add(e.user_id));
    interestStats.forEach((s) => allInvestorUids.add(s.memberUid));

    // Fetch member details, investor profiles, and team membership for organization
    const members = await this.prisma.member.findMany({
      where: { uid: { in: Array.from(allInvestorUids) } },
      select: {
        uid: true,
        name: true,
        image: { select: { url: true } },
        teamMemberRoles: {
          select: {
            mainTeam: true,
            team: { select: { name: true } },
          },
        },
        investorProfile: {
          select: {
            type: true,
            investmentFocus: true,
            typicalCheckSize: true,
          },
        },
      },
    });
    const memberMap = new Map(members.map((m) => [m.uid, m]));

    // Helper to get member info
    const getMemberInfo = (uid: string) => {
      const member = memberMap.get(uid);
      const mainTeamRole = member?.teamMemberRoles?.find((r) => r.mainTeam) || member?.teamMemberRoles?.[0];
      return {
        memberUid: uid,
        name: member?.name ?? 'Unknown',
        imageUrl: member?.image?.url ?? null,
        organization: mainTeamRole?.team?.name ?? null,
        investorProfile: member?.investorProfile
          ? {
              type: member.investorProfile.type,
              investmentFocus: member.investorProfile.investmentFocus,
              typicalCheckSize: member.investorProfile.typicalCheckSize,
            }
          : null,
      };
    };

    // Build interaction rows - one row per interaction
    const interactionRows: Array<{
      memberUid: string;
      name: string;
      imageUrl: string | null;
      organization: string | null;
      investorProfile: {
        type: string | null;
        investmentFocus: string[];
        typicalCheckSize: number | null;
      } | null;
      interactionType: InteractionType;
      interactionDate: Date;
    }> = [];

    // Add rows from Event table
    for (const event of individualEvents) {
      const interactionType = eventTypeToInteraction[event.event_type];
      if (!interactionType) continue;

      const memberInfo = getMemberInfo(event.user_id);
      interactionRows.push({
        ...memberInfo,
        interactionType,
        interactionDate: event.event_ts,
      });
    }

    // Add rows from DemoDayExpressInterestStatistic (for liked, connected, invested, introMade, feedbackGiven)
    for (const stat of interestStats) {
      const memberInfo = getMemberInfo(stat.memberUid);

      if (stat.liked) {
        interactionRows.push({
          ...memberInfo,
          interactionType: 'liked',
          interactionDate: stat.updatedAt,
        });
      }
      if (stat.connected) {
        interactionRows.push({
          ...memberInfo,
          interactionType: 'connected',
          interactionDate: stat.updatedAt,
        });
      }
      if (stat.invested) {
        interactionRows.push({
          ...memberInfo,
          interactionType: 'invested',
          interactionDate: stat.updatedAt,
        });
      }
      if (stat.referral) {
        interactionRows.push({
          ...memberInfo,
          interactionType: 'introMade',
          interactionDate: stat.updatedAt,
        });
      }
      if (stat.feedback) {
        interactionRows.push({
          ...memberInfo,
          interactionType: 'feedbackGiven',
          interactionDate: stat.updatedAt,
        });
      }
    }

    // Sort based on options
    interactionRows.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'lastActivity':
          comparison = a.interactionDate.getTime() - b.interactionDate.getTime();
          break;
        case 'totalInteractions':
          // For totalInteractions, sort by date as secondary since we now have one row per interaction
          comparison = a.interactionDate.getTime() - b.interactionDate.getTime();
          break;
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
      }
      return sortOrder === 'desc' ? -comparison : comparison;
    });

    // Paginate
    const total = interactionRows.length;
    const paginatedData = interactionRows.slice(offset, offset + limit);

    return {
      data: paginatedData.map((row) => ({
        member: {
          uid: row.memberUid,
          name: row.name,
          imageUrl: row.imageUrl,
          organization: row.organization,
        },
        investorProfile: row.investorProfile,
        interactionType: row.interactionType,
        interactionDate: row.interactionDate.toISOString(),
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

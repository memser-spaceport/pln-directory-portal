import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  forwardRef,
  Inject,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import cuid from 'cuid';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { DemoDaysService } from './demo-days.service';
import { PushNotificationsService } from '../push-notifications/push-notifications.service';
import { PushNotificationCategory } from '@prisma/client';

@Injectable()
export class DemoDayEngagementService {
  private readonly logger = new Logger(DemoDayEngagementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationServiceClient: NotificationServiceClient,
    @Inject(forwardRef(() => DemoDaysService))
    private readonly demoDaysService: DemoDaysService,
    private readonly pushNotificationsService: PushNotificationsService
  ) {}

  // Read engagement state for UI
  async getCurrentEngagement(memberEmail: string, demoDayUidOrSlug: string) {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      return {
        calendarAdded: false,
        calendarAddedAt: null,
      };
    }

    const engagement = await this.prisma.demoDayEngagement.findUnique({
      where: {
        demoDayUid_memberUid: {
          demoDayUid: demoDay.uid,
          memberUid: member.uid,
        },
      },
      select: { calendarAddedAt: true },
    });

    return {
      calendarAdded: !!engagement?.calendarAddedAt,
      calendarAddedAt: engagement?.calendarAddedAt ?? null,
    };
  }

  // Mark Add to Calendar click
  async markCalendarAdded(memberEmail: string, demoDayUidOrSlug: string) {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found by email');
    }

    const now = new Date();

    const updated = await this.prisma.demoDayEngagement.upsert({
      where: {
        demoDayUid_memberUid: {
          demoDayUid: demoDay.uid,
          memberUid: member.uid,
        },
      },
      update: { calendarAddedAt: now },
      create: {
        uid: cuid(), // 👈 generate cuid manually for explicit consistency
        demoDayUid: demoDay.uid,
        memberUid: member.uid,
        calendarAddedAt: now,
      },
      select: { uid: true, calendarAddedAt: true },
    });

    // Track analytics
    await this.analyticsService.trackEvent({
      name: 'demo-day-calendar-added',
      distinctId: member.uid,
      properties: {
        demoDayUid: demoDay.uid,
        demoDayEngagementUid: updated.uid,
        calendarAddedAt: updated.calendarAddedAt?.toISOString?.() || null,
      },
    });

    return {
      ok: true,
      calendarAddedAt: updated.calendarAddedAt,
    };
  }

  // Express interest in a fundraising profile
  async expressInterest(
    memberEmail: string,
    demoDayUidOrSlug: string,
    teamFundraisingProfileUid: string,
    interestType: 'like' | 'connect' | 'invest' | 'referral' | 'feedback',
    isPrepDemoDay = false,
    referralData?: {
      investorName?: string | null;
      investorEmail?: string | null;
      message?: string | null;
    } | null,
    feedbackData?: {
      feedback?: string | null;
    } | null
  ) {
    // Validate that the caller is an enabled demo day participant (investor)
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    if (!demoDay) {
      throw new ForbiddenException('No demo day access');
    }

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        name: true,
        email: true,
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
            status: 'ENABLED',
          },
          take: 1,
        },
        teamMemberRoles: {
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
    });

    if (!member || member.demoDayParticipants.length === 0) {
      throw new ForbiddenException('Only enabled demo day participants can express interest');
    }

    // Find the fundraising profile by team UID
    const fundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        uid: teamFundraisingProfileUid,
      },
      include: {
        team: {
          select: {
            uid: true,
            name: true,
          },
        },
      },
    });

    if (!fundraisingProfile || fundraisingProfile.demoDayUid !== demoDay.uid) {
      throw new BadRequestException('Invalid fundraising profile or not part of current demo day');
    }

    // Get enabled founders for this team in this demo day
    const founders = await this.prisma.demoDayParticipant.findMany({
      where: {
        demoDayUid: demoDay.uid,
        teamUid: fundraisingProfile.teamUid,
        status: 'ENABLED',
        isDeleted: false,
        type: 'FOUNDER',
      },
      include: {
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (founders.length === 0) {
      throw new BadRequestException('No enabled founders found for this team');
    }

    const founderEmails = founders.map((f) => f.member.email);

    // Get investor team information
    const investorTeamRole = member.teamMemberRoles?.find((role) => role.investmentTeam);

    const investorTeam = investorTeamRole?.team;

    // Map interest type to template name
    const templateMap = {
      like: {
        templateName: 'DEMO_DAY_LIKE_COMPANY_EMAIL',
        actionType: 'LIKE_COMPANY',
      },
      connect: {
        templateName: 'DEMO_DAY_CONNECT_COMPANY_EMAIL',
        actionType: 'CONNECT_COMPANY',
      },
      invest: {
        templateName: 'DEMO_DAY_INVEST_COMPANY_EMAIL',
        actionType: 'INVEST_COMPANY',
      },
      referral: {
        templateName: 'DEMO_DAY_REFERRAL_COMPANY_EMAIL',
        actionType: 'REFERRAL_COMPANY',
      },
      feedback: {
        templateName: 'DEMO_DAY_FEEDBACK_COMPANY_EMAIL',
        actionType: 'FEEDBACK_COMPANY',
      },
    };

    const template = templateMap[interestType];

    const teamsSubject = investorTeam
      ? `${fundraisingProfile.team.name} <> ${investorTeam.name}`
      : fundraisingProfile.team.name;
    const investorLink = `${process.env.WEB_UI_BASE_URL}/members/${member.uid}`;
    const investorTeamLink = investorTeam ? `${process.env.WEB_UI_BASE_URL}/teams/${investorTeam?.uid}` : '';
    const founderTeamLink = fundraisingProfile.team
      ? `${process.env.WEB_UI_BASE_URL}/teams/${fundraisingProfile.team?.uid}`
      : '';
    const founderTeamName = fundraisingProfile.team
      ? `<a href="${founderTeamLink}" target="_blank">${fundraisingProfile.team.name}</a>`
      : '';

    const investorName = member.name || '';
    const investorTeamName = investorTeam?.name || '';
    const investorTeamNameLink = investorTeam
      ? `<a href="${investorTeamLink}" target="_blank">${investorTeam?.name}</a>`
      : '';
    const investorNameLink = member.name ? `<a href="${investorLink}" target="_blank">${member.name}</a>` : '';

    // Send notification
    if (!isPrepDemoDay) {
      // Feedback emails go only to founders
      const isFeedback = interestType === 'feedback';

      // Send push notifications to founders (WebSocket real-time)
      const pushCategoryMap: Record<string, PushNotificationCategory> = {
        like: PushNotificationCategory.DEMO_DAY_LIKE,
        connect: PushNotificationCategory.DEMO_DAY_CONNECT,
        invest: PushNotificationCategory.DEMO_DAY_INVEST,
        referral: PushNotificationCategory.DEMO_DAY_REFERRAL,
        feedback: PushNotificationCategory.DEMO_DAY_FEEDBACK,
      };

      const pushTitleMap: Record<string, string> = {
        like: `${investorName} liked your company`,
        connect: `${investorName} wants to connect`,
        invest: `${investorName} is interested in investing`,
        referral: `${investorName} sent a referral`,
        feedback: `${investorName} sent feedback`,
      };

      const pushDescriptionMap: Record<string, string> = {
        like: `${investorName}${investorTeamName ? ` from ${investorTeamName}` : ''} liked ${
          fundraisingProfile.team.name
        } on ${demoDay.title}`,
        connect: `${investorName}${investorTeamName ? ` from ${investorTeamName}` : ''} wants to connect with ${
          fundraisingProfile.team.name
        }`,
        invest: `${investorName}${investorTeamName ? ` from ${investorTeamName}` : ''} is interested in investing in ${
          fundraisingProfile.team.name
        }`,
        referral: `${investorName}${investorTeamName ? ` from ${investorTeamName}` : ''} referred ${
          referralData?.investorName || 'an investor'
        } to ${fundraisingProfile.team.name}`,
        feedback: `${investorName}${investorTeamName ? ` from ${investorTeamName}` : ''} sent feedback to ${
          fundraisingProfile.team.name
        }`,
      };

      // Send push notification to each founder
      for (const founder of founders) {
        try {
          await this.pushNotificationsService.create({
            category: pushCategoryMap[interestType],
            title: pushTitleMap[interestType],
            description: pushDescriptionMap[interestType],
            recipientUid: founder.member.uid,
            link: `/members/${member.uid}`,
            metadata: {
              demoDayUid: demoDay.uid,
              demoDayTitle: demoDay.title,
              investorUid: member.uid,
              investorName: member.name,
              investorEmail: member.email,
              investorTeamUid: investorTeam?.uid,
              investorTeamName: investorTeam?.name,
              founderTeamUid: fundraisingProfile.teamUid,
              founderTeamName: fundraisingProfile.team.name,
              interestType,
              ...(referralData ? { referralData } : {}),
              ...(feedbackData ? { feedbackData } : {}),
            },
            isPublic: false,
          });
        } catch (error) {
          this.logger.error(
            `Failed to send push notification to founder ${founder.member.uid}: ${
              error instanceof Error ? error.message : error
            }`
          );
          // Continue with other founders even if one fails
        }
      }

      await this.notificationServiceClient.sendNotification({
        isPriority: true,
        deliveryChannel: 'EMAIL',
        templateName: template.templateName,
        recipientsInfo: {
          from: process.env.DEMO_DAY_EMAIL,
          to: isFeedback ? founderEmails : [...founderEmails, referralData?.investorEmail].filter(Boolean),
          cc: isFeedback ? [] : [member.email],
          bcc: [process.env.DEMO_DAY_EMAIL],
        },
        deliveryPayload: {
          body: {
            demoDayName: demoDay.title || 'PL F25 Demo Day',
            demoDayLink: `${process.env.WEB_UI_BASE_URL}/demoday?utm_source=email_intro`,
            subjectPrefix: isPrepDemoDay ? '[DEMO DAY PREP - PRACTICE EMAIL] ' : '',
            teamsSubject: teamsSubject,
            founderNames: founders.map((f) => f.member.name).join(', '),
            founderTeamName: founderTeamName,
            investorName: investorName,
            investorTeamName: investorTeamName,
            fromInvestorTeamName: investorTeamNameLink ? `from ${investorTeamNameLink}` : '',
            investorNameLink,
            ...(referralData
              ? {
                  referralTeamName: fundraisingProfile.team.name,
                  referralInvestorName: referralData.investorName || referralData.investorEmail,
                  referralInvestorEmail: referralData.investorEmail,
                  referralMessage: referralData.message,
                }
              : {}),
            ...(feedbackData
              ? {
                  feedbackText: feedbackData.feedback,
                }
              : {}),
          },
        },
        entityType: 'DEMO_DAY',
        actionType: template.actionType,
        sourceMeta: {
          activityId: '',
          activityType: 'DEMO_DAY',
          activityUserId: member.uid,
          activityUserName: member.name,
        },
        targetMeta: {
          emailId: member.email,
          userId: member.uid,
          userName: member.name,
        },
      });
    }

    // Increment sticky flags & counters (+1 only on the first activation of each flag)
    await this.upsertInterestWithCounters({
      demoDayUid: fundraisingProfile.demoDayUid,
      memberUid: member.uid,
      teamFundraisingProfileUid,
      isPrepDemoDay,
      interestType,
    });

    // Fire analytics (non-blocking)
    setTimeout(async () => {
      await this.analyticsService.trackEvent({
        name: 'demo-day-express-interest',
        distinctId: member.uid,
        properties: {
          demoDayUid: demoDay.uid,
          userId: member.uid,
          userName: member.name,
          userEmail: member.email,
          founderNames: founders.map((f) => f.member.name).join(','),
          founderEmails: founders.map((f) => f.member.email).join(','),
          teamUid: fundraisingProfile.teamUid,
          teamName: fundraisingProfile.team.name,
          interestType,
          isPrepDemoDay,
          ...(referralData
            ? {
                referralName: referralData.investorName,
                referralEmail: referralData.investorEmail,
                referralMessage: referralData.message,
              }
            : {}),
          ...(feedbackData
            ? {
                feedbackText: feedbackData.feedback,
              }
            : {}),
        },
      });
    }, 500);

    return { success: true };
  }

  /**
   * Upserts the user's interest row and increments aggregate counters
   * (+1 only on the first time a given flag flips false -> true).
   * All changes happen atomically inside a single transaction.
   */
  private async upsertInterestWithCounters(args: {
    demoDayUid: string;
    memberUid: string;
    teamFundraisingProfileUid: string;
    isPrepDemoDay: boolean;
    interestType: 'like' | 'connect' | 'invest' | 'referral' | 'feedback';
  }) {
    const { demoDayUid, memberUid, teamFundraisingProfileUid, isPrepDemoDay, interestType } = args;

    const patch = {
      liked: interestType === 'like',
      connected: interestType === 'connect',
      invested: interestType === 'invest',
      referral: interestType === 'referral',
      feedback: interestType === 'feedback',
    };

    await this.prisma.$transaction(async (tx) => {
      // Load existing (if any)
      const existing = await tx.demoDayExpressInterestStatistic.findUnique({
        where: {
          demoDayUid_memberUid_teamFundraisingProfileUid_isPrepDemoDay: {
            demoDayUid,
            memberUid,
            teamFundraisingProfileUid,
            isPrepDemoDay,
          },
        },
        select: { uid: true, liked: true, connected: true, invested: true, referral: true, feedback: true },
      });

      // Next sticky booleans (once true — stays true)
      const nextLiked = (existing?.liked ?? false) || patch.liked;
      const nextConnected = (existing?.connected ?? false) || patch.connected;
      const nextInvested = (existing?.invested ?? false) || patch.invested;
      const nextReferral = (existing?.referral ?? false) || patch.referral;
      const nextFeedback = (existing?.feedback ?? false) || patch.feedback;

      // Deltas: +1 only when flipping false -> true in this call
      const dLiked = !existing?.liked && patch.liked ? 1 : 0;
      const dConnected = !existing?.connected && patch.connected ? 1 : 0;
      const dInvested = !existing?.invested && patch.invested ? 1 : 0;
      const dReferral = !existing?.referral && patch.referral ? 1 : 0;
      const dFeedback = !existing?.feedback && patch.feedback ? 1 : 0;
      const dTotal = dLiked + dConnected + dInvested + dReferral + dFeedback;

      if (!existing) {
        // First interaction for this (demoDay, member, profile, prep)
        await tx.demoDayExpressInterestStatistic.create({
          data: {
            uid: cuid(),
            demoDayUid,
            memberUid,
            teamFundraisingProfileUid,
            isPrepDemoDay,
            liked: nextLiked,
            connected: nextConnected,
            invested: nextInvested,
            referral: nextReferral,
            feedback: nextFeedback,
            likedCount: dLiked,
            connectedCount: dConnected,
            investedCount: dInvested,
            feedbackCount: dFeedback,
            totalCount: dTotal,
          },
          select: { uid: true },
        });
      } else {
        // Update booleans and increment counters conditionally
        await tx.demoDayExpressInterestStatistic.update({
          where: { uid: existing.uid },
          data: {
            liked: nextLiked,
            connected: nextConnected,
            invested: nextInvested,
            referral: nextReferral,
            feedback: nextFeedback,
            ...(dLiked > 0 ? { likedCount: { increment: dLiked } } : {}),
            ...(dConnected > 0 ? { connectedCount: { increment: dConnected } } : {}),
            ...(dInvested > 0 ? { investedCount: { increment: dInvested } } : {}),
            ...(dReferral > 0 ? { referralCount: { increment: dReferral } } : {}),
            ...(dFeedback > 0 ? { feedbackCount: { increment: dFeedback } } : {}),
            ...(dTotal > 0 ? { totalCount: { increment: dTotal } } : {}),
          },
          select: { uid: true },
        });
      }
    });
  }
}

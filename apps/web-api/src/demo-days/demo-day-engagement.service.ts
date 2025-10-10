import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import cuid from 'cuid';
import { NotificationServiceClient } from '../notifications/notification-service.client';

@Injectable()
export class DemoDayEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

  // Get current demo day or throw if none exists
  private async getCurrentDemoDay(): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: { in: [DemoDayStatus.UPCOMING, DemoDayStatus.ACTIVE, DemoDayStatus.COMPLETED] },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!demoDay) {
      throw new NotFoundException('No active demo day found');
    }

    return demoDay;
  }

  // Read engagement state for UI
  async getCurrentEngagement(memberEmail: string) {
    const demoDay = await this.getCurrentDemoDay();

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
  async markCalendarAdded(memberEmail: string) {
    const demoDay = await this.getCurrentDemoDay();

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
    teamFundraisingProfileUid: string,
    interestType: 'like' | 'connect' | 'invest',
    isPrepDemoDay = false
  ) {
    // Validate that the caller is an enabled demo day participant (investor)
    const demoDay = await this.getCurrentDemoDay();

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
    const investorTeamRole =
      member.teamMemberRoles?.find((role) => role.investmentTeam) ||
      member.teamMemberRoles?.find((role) => role.mainTeam) ||
      member.teamMemberRoles?.[0];

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
    const investorTeamName = investorTeam
      ? `<a href="${investorTeamLink}" target="_blank">${investorTeam?.name}</a>`
      : '';
    const investorName = member.name ? `<a href="${investorLink}" target="_blank">${member.name}</a>` : '';

    // Send notification
    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: template.templateName,
      recipientsInfo: {
        from: process.env.DEMO_DAY_EMAIL,
        to: founderEmails,
        cc: [member.email],
        bcc: [process.env.DEMO_DAY_EMAIL],
      },
      deliveryPayload: {
        body: {
          demoDayName: demoDay.title || 'PL F25 Demo Day',
          subjectPrefix: isPrepDemoDay ? '[DEMO DAY PREP - PRACTICE EMAIL] ' : '',
          teamsSubject: teamsSubject,
          founderNames: founders.map((f) => f.member.name).join(', '),
          founderTeamName: founderTeamName,
          investorName: investorName,
          investorTeamName: investorTeamName,
          fromInvestorTeamName: investorTeamName ? `from ${investorTeamName}` : '',
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

    // use setTimeout to not block the response
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
        },
      });
    }, 500);

    return { success: true };
  }
}

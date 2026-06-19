import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma, TeamPitchStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { TeamPitchesService } from './team-pitches.service';

@Injectable()
export class TeamPitchEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly teamPitchesService: TeamPitchesService,
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly analyticsService: AnalyticsService
  ) {}

  async expressInterest(
    memberEmail: string,
    slugOrUid: string,
    interestType: 'connect' | 'invest' | 'referral' | 'feedback',
    isPrepRequested = false,
    teamPitchProfileUid?: string,
    referralData?: {
      investorName?: string | null;
      investorEmail?: string | null;
      message?: string | null;
    } | null,
    feedbackData?: { feedback?: string | null } | null
  ) {
    const pitch = await this.teamPitchesService.getPitchBySlugOrUid(slugOrUid);
    if (!pitch) {
      throw new ForbiddenException('No team pitch access');
    }

    const resolved = await this.teamPitchesService.resolveAccess(memberEmail, pitch.uid);
    if (resolved.access === 'restricted') {
      throw new ForbiddenException('No team pitch access');
    }

    const isPrep = isPrepRequested || pitch.status === TeamPitchStatus.DRAFT;

    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      include: {
        teamMemberRoles: {
          include: { team: { select: { uid: true, name: true, isFund: true } } },
        },
      },
    });

    if (!member) {
      throw new ForbiddenException('Member not found');
    }

    const profile = await this.prisma.teamPitchProfile.findFirst({
      where: {
        teamPitchUid: pitch.uid,
        ...(teamPitchProfileUid ? { uid: teamPitchProfileUid } : {}),
      },
      include: { teamPitch: { include: { team: { select: { uid: true, name: true } } } } },
    });

    if (!profile) {
      throw new BadRequestException('Invalid team pitch profile');
    }

    const founders = await this.prisma.teamPitchParticipant.findMany({
      where: {
        teamPitchUid: pitch.uid,
        teamUid: pitch.teamUid,
        type: 'FOUNDER',
        access: { not: 'RESTRICTED' },
      },
      include: { member: { select: { uid: true, name: true, email: true } } },
    });

    if (founders.length === 0) {
      throw new BadRequestException('No founders found for this team');
    }

    const founderEmails = founders.map((f) => f.member.email).filter(Boolean) as string[];
    const investorTeamRole = member.teamMemberRoles?.find((role) => role.investmentTeam);
    const investorTeam = investorTeamRole?.team;
    const team = profile.teamPitch.team;

    const templateMap = {
      connect: { templateName: 'TEAM_PITCH_CONNECT_EMAIL', actionType: 'CONNECT' },
      invest: { templateName: 'TEAM_PITCH_INVEST_EMAIL', actionType: 'INVEST' },
      referral: { templateName: 'TEAM_PITCH_REFERRAL_EMAIL', actionType: 'REFERRAL' },
      feedback: { templateName: 'TEAM_PITCH_FEEDBACK_EMAIL', actionType: 'FEEDBACK' },
    };
    const template = templateMap[interestType];

    const webBase = process.env.WEB_UI_BASE_URL || '';
    const pitchLink = `${webBase}/spotlight/${pitch.slug}`;
    const investorLink = `${webBase}/members/${member.uid}`;
    const investorTeamLink = investorTeam ? `${webBase}/teams/${investorTeam.uid}` : '';
    const founderTeamLink = `${webBase}/teams/${team.uid}`;
    const founderTeamName = `<a href="${founderTeamLink}" target="_blank">${team.name}</a>`;
    const investorName = member.name || '';
    const investorTeamName = investorTeam?.name || '';
    const investorTeamNameLink = investorTeam
      ? `<a href="${investorTeamLink}" target="_blank">${investorTeam.name}</a>`
      : '';
    const investorNameLink = member.name ? `<a href="${investorLink}" target="_blank">${member.name}</a>` : '';
    const teamsSubject = investorTeam ? `${team.name} <> ${investorTeam.name}` : team.name;
    const isFeedback = interestType === 'feedback';

    if (!isPrep) {
      await this.notificationServiceClient.sendNotification({
        isPriority: true,
        deliveryChannel: 'EMAIL',
        templateName: template.templateName,
        recipientsInfo: {
          from: process.env.DEMO_DAY_EMAIL,
          to: isFeedback ? founderEmails : [...founderEmails, referralData?.investorEmail].filter(Boolean),
          cc: isFeedback ? [] : [member.email].filter(Boolean),
          bcc: process.env.DEMO_DAY_EMAIL ? [process.env.DEMO_DAY_EMAIL] : [],
        },
        deliveryPayload: {
          body: {
            pitchTitle: pitch.title,
            pitchLink,
            teamsSubject,
            founderNames: founders.map((f) => f.member.name).join(', '),
            founderTeamName,
            investorName,
            investorTeamName,
            fromInvestorTeamName: investorTeamNameLink ? `from ${investorTeamNameLink}` : '',
            investorNameLink,
            ...(referralData
              ? {
                  referralTeamName: team.name,
                  referralInvestorName: referralData.investorName || referralData.investorEmail,
                  referralInvestorEmail: referralData.investorEmail,
                  referralMessage: referralData.message,
                }
              : {}),
            ...(feedbackData ? { feedbackText: feedbackData.feedback } : {}),
          },
        },
        entityType: 'TEAM_PITCH',
        actionType: template.actionType,
        sourceMeta: {
          activityId: pitch.uid,
          activityType: 'TEAM_PITCH',
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

    await this.upsertInterestWithCounters({
      teamPitchUid: pitch.uid,
      memberUid: member.uid,
      teamPitchProfileUid: profile.uid,
      isPrep,
      interestType,
      interestValue: true,
    });

    setTimeout(async () => {
      await this.analyticsService.trackEvent({
        name: 'demo-day-express-interest',
        distinctId: member.uid,
        properties: {
          pageContext: 'pitch',
          teamPitchUid: pitch.uid,
          userId: member.uid,
          userName: member.name,
          userEmail: member.email,
          teamUid: team.uid,
          teamName: team.name,
          interestType,
          isPrep,
        },
      });
    }, 500);

    return { success: true, isPrep };
  }

  private async upsertInterestWithCounters(args: {
    teamPitchUid: string;
    memberUid: string;
    teamPitchProfileUid: string;
    isPrep: boolean;
    interestType: 'connect' | 'invest' | 'referral' | 'feedback';
    interestValue: boolean;
  }) {
    const interestTypeFields = {
      connect: 'connected',
      invest: 'invested',
      referral: 'referral',
      feedback: 'feedback',
    } as const;

    const flagField = interestTypeFields[args.interestType];
    const countField = `${flagField}Count` as const;

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.teamPitchExpressInterest.findUnique({
        where: {
          teamPitchUid_memberUid_teamPitchProfileUid_isPrep: {
            teamPitchUid: args.teamPitchUid,
            memberUid: args.memberUid,
            teamPitchProfileUid: args.teamPitchProfileUid,
            isPrep: args.isPrep,
          },
        },
      });

      const wasActive = existing?.[flagField] ?? false;
      const increment = args.interestValue && !wasActive ? 1 : 0;

      const data: Prisma.TeamPitchExpressInterestUpdateInput = {
        [flagField]: args.interestValue,
        ...(increment
          ? {
              [countField]: { increment: 1 },
              totalCount: { increment: 1 },
            }
          : {}),
      };

      await tx.teamPitchExpressInterest.upsert({
        where: {
          teamPitchUid_memberUid_teamPitchProfileUid_isPrep: {
            teamPitchUid: args.teamPitchUid,
            memberUid: args.memberUid,
            teamPitchProfileUid: args.teamPitchProfileUid,
            isPrep: args.isPrep,
          },
        },
        create: {
          teamPitchUid: args.teamPitchUid,
          memberUid: args.memberUid,
          teamPitchProfileUid: args.teamPitchProfileUid,
          isPrep: args.isPrep,
          [flagField]: args.interestValue,
          [countField]: increment,
          totalCount: increment,
        },
        update: data,
      });
    });
  }
}

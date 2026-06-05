import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberApprovalState, TeamPitchParticipantType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { upsertPolicyAssignmentByCode } from '../demo-days/demo-day-investor-policy.util';
import { defaultAccessForParticipantType } from './team-pitch.utils';
@Injectable()
export class TeamPitchParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient
  ) {}

  async listParticipants(pitchUid: string, type?: TeamPitchParticipantType) {
    const participants = await this.prisma.teamPitchParticipant.findMany({
      where: {
        teamPitchUid: pitchUid,
        ...(type ? { type } : {}),
      },
      include: {
        team: {
          select: {
            uid: true,
            name: true,
          },
        },
        member: {
          select: {
            uid: true,
            name: true,
            email: true,
            externalId: true,
            image: { select: { uid: true, url: true } },
            memberApproval: { select: { state: true } },
            investorProfile: { select: { type: true } },
            teamMemberRoles: {
              select: {
                mainTeam: true,
                team: {
                  select: {
                    uid: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return participants.map((p) => ({
      uid: p.uid,
      memberUid: p.memberUid,
      type: p.type,
      access: p.access,
      teamUid: p.teamUid,
      confidentialityAccepted: p.confidentialityAccepted,
      inviteSentAt: p.inviteSentAt?.toISOString() ?? null,
      inviteSentCount: p.inviteSentCount,
      team: p.team,
      member: p.member
        ? {
            uid: p.member.uid,
            name: p.member.name,
            email: p.member.email,
            externalId: p.member.externalId,
            profilePicture: p.member.image?.url ?? null,
            memberState: p.member.memberApproval?.state ?? null,
            investorProfile: p.member.investorProfile,
            teamMemberRoles: p.member.teamMemberRoles,
          }
        : null,
    }));
  }

  async addParticipant(
    pitchUid: string,
    data: {
      memberUid?: string;
      email?: string;
      name?: string;
      type: TeamPitchParticipantType;
    }
  ) {
    const pitch = await this.prisma.teamPitch.findUnique({ where: { uid: pitchUid } });
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    let member: { uid: string; email: string | null; name: string };
    let isNewMember = false;

    if (data.memberUid) {
      const found = await this.prisma.member.findUnique({
        where: { uid: data.memberUid },
      });
      if (!found) {
        throw new BadRequestException('Member not found');
      }
      member = found;
    } else if (data.email) {
      const email = data.email.toLowerCase().trim();
      const existing = await this.prisma.member.findUnique({ where: { email } });
      if (existing) {
        member = existing;
      } else {
        isNewMember = true;
        member = await this.prisma.member.create({
          data: {
            name: data.name || email,
            email,
            approveOnLogin: true,
            memberApproval: {
              create: {
                state: 'PENDING',
                reason: 'Auto-created for team pitch participant',
              },
            },
          },
        });
      }
    } else {
      throw new BadRequestException('Either memberUid or email must be provided');
    }

    if (data.type === 'INVESTOR' && !isNewMember) {
      await this.setApproveOnLoginForUnapprovedInvestor(member.uid);
    }

    const existingParticipant = await this.prisma.teamPitchParticipant.findUnique({
      where: {
        teamPitchUid_memberUid: {
          teamPitchUid: pitchUid,
          memberUid: member.uid,
        },
      },
    });
    if (existingParticipant) {
      throw new BadRequestException('Participant already exists for this pitch');
    }

    if (data.type === 'INVESTOR') {
      await upsertPolicyAssignmentByCode(this.prisma, member.uid, 'investor_pl');
    }

    const access = defaultAccessForParticipantType(data.type);
    const teamUid = data.type === 'FOUNDER' ? pitch.teamUid : null;

    const created = await this.prisma.teamPitchParticipant.create({
      data: {
        teamPitchUid: pitchUid,
        memberUid: member.uid,
        type: data.type,
        access,
        teamUid,
      },
      include: {
        member: {
          select: { uid: true, name: true, email: true },
        },
      },
    });

    return created;
  }

  async updateParticipant(
    pitchUid: string,
    participantUid: string,
    data: { type?: TeamPitchParticipantType; access?: 'VIEW' | 'EDIT' | 'RESTRICTED' }
  ) {
    const participant = await this.prisma.teamPitchParticipant.findFirst({
      where: { uid: participantUid, teamPitchUid: pitchUid },
      include: { teamPitch: true },
    });
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    const type = data.type ?? participant.type;
    let access = data.access ?? participant.access;
    if (data.type && !data.access) {
      access = defaultAccessForParticipantType(type);
    }

    const teamUid = type === 'FOUNDER' ? participant.teamPitch.teamUid : participant.teamUid;

    if (data.type === 'INVESTOR') {
      await upsertPolicyAssignmentByCode(this.prisma, participant.memberUid, 'investor_pl');
    }

    return this.prisma.teamPitchParticipant.update({
      where: { uid: participantUid },
      data: {
        type,
        access,
        teamUid,
      },
      include: {
        member: { select: { uid: true, name: true, email: true } },
      },
    });
  }

  async sendInvestorInvite(pitchUid: string, participantUid: string) {
    const participant = await this.prisma.teamPitchParticipant.findFirst({
      where: { uid: participantUid, teamPitchUid: pitchUid },
      include: {
        member: { select: { uid: true, name: true, email: true } },
        teamPitch: {
          include: {
            team: { select: { name: true } },
          },
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found');
    }
    if (participant.type !== 'INVESTOR') {
      throw new BadRequestException('Invite can only be sent to investors');
    }
    if (!participant.member.email) {
      throw new BadRequestException('Investor has no email');
    }

    const webBase = process.env.WEB_UI_BASE_URL || '';
    const pitchLink = `${webBase}/pitch/${participant.teamPitch.slug}?prefillEmail=${encodeURIComponent(
      participant.member.email
    )}`;

    await this.notificationServiceClient.sendNotification({
      isPriority: true,
      deliveryChannel: 'EMAIL',
      templateName: 'TEAM_PITCH_INVESTOR_INVITE_EMAIL',
      recipientsInfo: {
        from: process.env.DEMO_DAY_EMAIL,
        to: [participant.member.email],
        bcc: process.env.DEMO_DAY_EMAIL ? [process.env.DEMO_DAY_EMAIL] : [],
      },
      deliveryPayload: {
        body: {
          investorName: participant.member.name || '',
          investorEmail: participant.member.email,
          pitchTitle: participant.teamPitch.title,
          pitchSlug: participant.teamPitch.slug,
          pitchLink,
          teamName: participant.teamPitch.team.name,
          supportEmail: participant.teamPitch.supportEmail,
        },
      },
      entityType: 'TEAM_PITCH',
      actionType: 'INVESTOR_INVITE',
      sourceMeta: {
        activityId: participant.teamPitch.uid,
        activityType: 'TEAM_PITCH',
        activityUserId: participant.member.uid,
        activityUserName: participant.member.name,
      },
      targetMeta: {
        emailId: participant.member.email,
        userId: participant.member.uid,
        userName: participant.member.name,
      },
    });

    await this.prisma.teamPitchParticipant.update({
      where: { uid: participantUid },
      data: {
        inviteSentAt: new Date(),
        inviteSentCount: { increment: 1 },
      },
    });

    return { success: true };
  }

  private async setApproveOnLoginForUnapprovedInvestor(memberUid: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: {
        approveOnLogin: true,
        memberApproval: { select: { state: true } },
      },
    });
    if (!member) {
      return;
    }

    const state = member.memberApproval?.state;
    if (state === MemberApprovalState.APPROVED || state === MemberApprovalState.VERIFIED) {
      return;
    }

    if (!member.memberApproval) {
      await this.prisma.memberApproval.create({
        data: {
          memberUid,
          state: MemberApprovalState.PENDING,
          reason: 'Team pitch investor participant added',
        },
      });
      await this.prisma.member.update({
        where: { uid: memberUid },
        data: { approveOnLogin: true },
      });
      return;
    }

    if (state !== MemberApprovalState.PENDING || member.approveOnLogin) {
      return;
    }

    await this.prisma.member.update({
      where: { uid: memberUid },
      data: { approveOnLogin: true },
    });
  }
}

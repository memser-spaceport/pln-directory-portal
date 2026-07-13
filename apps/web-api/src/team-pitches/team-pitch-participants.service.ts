import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MemberApprovalState, Prisma, Team, TeamPitchParticipantType } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { NotificationServiceClient } from '../notifications/notification-service.client';
import { upsertPolicyAssignmentByCode } from '../demo-days/demo-day-investor-policy.util';
import { defaultAccessForParticipantType } from './team-pitch.utils';
import { InvestorBulkProvisionService } from '../investors/investor-bulk-provision.service';
import { InvestorBulkRowResult, InvestorBulkSummary } from '../investors/investor-bulk.types';
@Injectable()
export class TeamPitchParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationServiceClient: NotificationServiceClient,
    private readonly investorBulkProvisionService: InvestorBulkProvisionService
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
    data: { type?: TeamPitchParticipantType; access?: 'VIEW' | 'VIEW_ADMIN' | 'EDIT' | 'RESTRICTED' }
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

  async removeParticipant(pitchUid: string, participantUid: string) {
    const participant = await this.prisma.teamPitchParticipant.findFirst({
      where: { uid: participantUid, teamPitchUid: pitchUid },
    });
    if (!participant) {
      throw new NotFoundException('Participant not found');
    }

    await this.prisma.teamPitchParticipant.delete({
      where: { uid: participantUid },
    });

    return { success: true };
  }

  async removeParticipantsBulk(pitchUid: string, participantUids: string[]) {
    const pitch = await this.prisma.teamPitch.findUnique({ where: { uid: pitchUid } });
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const uniqueUids = [...new Set(participantUids)];
    const existing = await this.prisma.teamPitchParticipant.findMany({
      where: { teamPitchUid: pitchUid, uid: { in: uniqueUids } },
      select: { uid: true },
    });
    const existingUids = new Set(existing.map((p) => p.uid));

    const rows: Array<{
      participantUid: string;
      status: 'removed' | 'skipped';
      message?: string | null;
    }> = [];

    let removed = 0;
    let skipped = 0;

    for (const uid of uniqueUids) {
      if (!existingUids.has(uid)) {
        skipped++;
        rows.push({
          participantUid: uid,
          status: 'skipped',
          message: 'Participant not found on this spotlight',
        });
        continue;
      }

      await this.prisma.teamPitchParticipant.delete({ where: { uid } });
      removed++;
      rows.push({ participantUid: uid, status: 'removed' });
    }

    return {
      summary: {
        total: uniqueUids.length,
        removed,
        skipped,
      },
      rows,
    };
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
    if (participant.access === 'RESTRICTED') {
      throw new BadRequestException('Invite cannot be sent to investors with No Access');
    }
    if (!participant.member.email) {
      throw new BadRequestException('Investor has no email');
    }

    const webBase = process.env.WEB_UI_BASE_URL || '';
    const pitchLink = `${webBase}/spotlight/${participant.teamPitch.slug}?prefillEmail=${encodeURIComponent(
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

  async sendInvestorInvitesBulk(
    pitchUid: string,
    options: { includeAlreadyInvited?: boolean; participantUids?: string[] } = {}
  ): Promise<{
    summary: { totalEligible: number; sent: number; skipped: number; errors: number };
    rows: Array<{
      participantUid: string;
      email: string | null;
      name: string | null;
      status: 'sent' | 'skipped' | 'error';
      message?: string | null;
    }>;
  }> {
    const includeAlreadyInvited = options.includeAlreadyInvited ?? false;
    const selectedUids = options.participantUids?.length ? new Set(options.participantUids) : null;

    const pitch = await this.prisma.teamPitch.findUnique({ where: { uid: pitchUid } });
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const investors = await this.prisma.teamPitchParticipant.findMany({
      where: {
        teamPitchUid: pitchUid,
        type: 'INVESTOR',
        ...(selectedUids ? { uid: { in: [...selectedUids] } } : {}),
      },
      include: {
        member: { select: { uid: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    const summary = { totalEligible: 0, sent: 0, skipped: 0, errors: 0 };
    const rows: Array<{
      participantUid: string;
      email: string | null;
      name: string | null;
      status: 'sent' | 'skipped' | 'error';
      message?: string | null;
    }> = [];

    for (const investor of investors) {
      const email = investor.member?.email ?? null;
      const name = investor.member?.name ?? null;

      if (investor.access === 'RESTRICTED') {
        summary.skipped++;
        rows.push({
          participantUid: investor.uid,
          email,
          name,
          status: 'skipped',
          message: 'Investor has No Access',
        });
        continue;
      }

      if (!email) {
        summary.skipped++;
        rows.push({
          participantUid: investor.uid,
          email,
          name,
          status: 'skipped',
          message: 'Investor has no email',
        });
        continue;
      }

      if (!includeAlreadyInvited && investor.inviteSentCount > 0) {
        summary.skipped++;
        rows.push({
          participantUid: investor.uid,
          email,
          name,
          status: 'skipped',
          message: 'Invite already sent',
        });
        continue;
      }

      summary.totalEligible++;
      try {
        await this.sendInvestorInvite(pitchUid, investor.uid);
        summary.sent++;
        rows.push({
          participantUid: investor.uid,
          email,
          name,
          status: 'sent',
        });
      } catch (error) {
        summary.errors++;
        rows.push({
          participantUid: investor.uid,
          email,
          name,
          status: 'error',
          message: error instanceof Error ? error.message : 'Failed to send invite',
        });
      }
    }

    return { summary, rows };
  }

  async addInvestorParticipantsBulk(
    pitchUid: string,
    data: {
      participants: Array<{
        email: string;
        name: string;
        organization?: string | null;
        organizationEmail?: string | null;
        twitterHandler?: string | null;
        linkedinHandler?: string | null;
        telegramHandler?: string | null;
        role?: string | null;
        investmentType?: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null;
        typicalCheckSize?: number | null;
        investInStartupStages?: string[] | null;
        secRulesAccepted?: boolean | null;
        makeTeamLead?: boolean;
      }>;
    }
  ): Promise<{ summary: InvestorBulkSummary; rows: InvestorBulkRowResult[] }> {
    const pitch = await this.prisma.teamPitch.findUnique({ where: { uid: pitchUid } });
    if (!pitch) {
      throw new NotFoundException('Team pitch not found');
    }

    const summary: InvestorBulkSummary = {
      total: data.participants.length,
      createdUsers: 0,
      updatedUsers: 0,
      createdTeams: 0,
      updatedMemberships: 0,
      promotedToLead: 0,
      errors: 0,
    };

    const rows: InvestorBulkRowResult[] = [];
    const emails = data.participants.map((p) => p.email);

    const existingMembers = await this.prisma.member.findMany({
      where: { email: { in: emails } },
      include: {
        investorProfile: true,
        teamMemberRoles: {
          include: { team: true },
        },
        teamPitchParticipants: {
          where: { teamPitchUid: pitchUid },
        },
      },
    });

    const existingMembersByEmail = new Map(existingMembers.map((m) => [m.email, m]));
    const existingParticipantEmails = new Set(
      existingMembers.filter((m) => m.teamPitchParticipants.length > 0).map((m) => m.email)
    );

    const teamCache = new Map<string, Team>();
    const telegramOwnerCache = new Map<string, string | null>();

    await this.prisma.$transaction(async (tx) => {
      for (const participantData of data.participants) {
        try {
          const willBeTeamLead = participantData.organization
            ? typeof participantData.makeTeamLead === 'boolean'
              ? participantData.makeTeamLead
              : true
            : false;

          const rowResult: InvestorBulkRowResult = {
            email: participantData.email,
            name: participantData.name,
            organization: participantData.organization,
            organizationEmail: participantData.organizationEmail,
            twitterHandler: this.investorBulkProvisionService.normalizeTwitterHandler(participantData.twitterHandler),
            linkedinHandler: this.investorBulkProvisionService.normalizeLinkedinHandler(
              participantData.linkedinHandler
            ),
            telegramHandler: this.investorBulkProvisionService.normalizeTelegramHandler(
              participantData.telegramHandler
            ),
            role: participantData.role,
            investmentType: participantData.investmentType,
            typicalCheckSize: participantData.typicalCheckSize,
            investInStartupStages: participantData.investInStartupStages,
            secRulesAccepted: participantData.secRulesAccepted,
            makeTeamLead: participantData.makeTeamLead,
            willBeTeamLead,
            status: 'success',
          };

          if (existingParticipantEmails.has(participantData.email)) {
            rowResult.status = 'error';
            rowResult.message = 'Participant already exists for this team pitch';
            rows.push(rowResult);
            summary.errors++;
            continue;
          }

          const existingMember = existingMembersByEmail.get(participantData.email);
          const provisioned = await this.investorBulkProvisionService.provisionInvestorFromBulkRow(
            tx,
            participantData,
            existingMember,
            { teamCache, telegramOwnerCache },
            {
              useApproveOnLogin: true,
              memberCreationReason: 'Auto-created for team pitch participant',
            }
          );

          summary.createdUsers += provisioned.summaryDelta.createdUsers;
          summary.updatedUsers += provisioned.summaryDelta.updatedUsers;
          summary.createdTeams += provisioned.summaryDelta.createdTeams;
          summary.updatedMemberships += provisioned.summaryDelta.updatedMemberships;
          summary.promotedToLead += provisioned.summaryDelta.promotedToLead;

          if (!provisioned.isNewUser) {
            await this.setApproveOnLoginForUnapprovedInvestor(provisioned.memberUid, tx);
          }

          await upsertPolicyAssignmentByCode(tx, provisioned.memberUid, 'investor_pl');

          await tx.teamPitchParticipant.create({
            data: {
              teamPitchUid: pitchUid,
              memberUid: provisioned.memberUid,
              type: 'INVESTOR',
              access: 'VIEW',
              teamUid: null,
            },
          });

          existingParticipantEmails.add(participantData.email);

          rowResult.userId = provisioned.memberUid;
          rowResult.teamId = provisioned.orgTeamUid;
          rowResult.twitterHandler = provisioned.normalizedTwitter;
          rowResult.linkedinHandler = provisioned.normalizedLinkedin;
          rowResult.telegramHandler = provisioned.normalizedTelegram;
          rowResult.willBeTeamLead = provisioned.willBeTeamLead;

          rows.push(rowResult);
        } catch (error) {
          summary.errors++;
          rows.push({
            email: participantData.email,
            name: participantData.name,
            organization: participantData.organization,
            organizationEmail: participantData.organizationEmail,
            twitterHandler: this.investorBulkProvisionService.normalizeTwitterHandler(participantData.twitterHandler),
            linkedinHandler: this.investorBulkProvisionService.normalizeLinkedinHandler(
              participantData.linkedinHandler
            ),
            telegramHandler: this.investorBulkProvisionService.normalizeTelegramHandler(
              participantData.telegramHandler
            ),
            role: participantData.role,
            investmentType: participantData.investmentType,
            typicalCheckSize: participantData.typicalCheckSize,
            investInStartupStages: participantData.investInStartupStages,
            secRulesAccepted: participantData.secRulesAccepted,
            makeTeamLead: participantData.makeTeamLead,
            willBeTeamLead: participantData.organization ? true : participantData.makeTeamLead || false,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
          });
        }
      }
    });

    return { summary, rows };
  }

  private async setApproveOnLoginForUnapprovedInvestor(
    memberUid: string,
    db: PrismaService | Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    const member = await db.member.findUnique({
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
      await db.memberApproval.create({
        data: {
          memberUid,
          state: MemberApprovalState.PENDING,
          reason: 'Team pitch investor participant added',
        },
      });
      await db.member.update({
        where: { uid: memberUid },
        data: { approveOnLogin: true },
      });
      return;
    }

    if (state !== MemberApprovalState.PENDING || member.approveOnLogin) {
      return;
    }

    await db.member.update({
      where: { uid: memberUid },
      data: { approveOnLogin: true },
    });
  }
}

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DemoDayParticipant, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { TeamsService } from '../teams/teams.service';
import { TeamEnrichmentService } from '../team-enrichment/team-enrichment.service';
import { applyDemoDayParticipantPolicyAssignments } from './demo-day-investor-policy.util';
import { InvestorBulkProvisionService } from '../investors/investor-bulk-provision.service';
import { InvestorBulkRowResult, InvestorBulkSummary } from '../investors/investor-bulk.types';

@Injectable()
export class DemoDayParticipantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoDaysService: DemoDaysService,
    private readonly analyticsService: AnalyticsService,
    private readonly teamService: TeamsService,
    private readonly teamEnrichmentService: TeamEnrichmentService,
    private readonly investorBulkProvisionService: InvestorBulkProvisionService
  ) {}

  async addParticipant(
    demoDayUid: string,
    data: {
      memberUid?: string;
      email?: string;
      name?: string;
      type: 'INVESTOR' | 'FOUNDER' | 'SUPPORT';
    },
    actorEmail?: string,
    adminJwt?: { memberUid?: string; uid?: string }
  ): Promise<DemoDayParticipant> {
    const demoDayRecord = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    await this.demoDaysService.assertActorCanManageDemoDayOrThrow(actorEmail, adminJwt, demoDayUid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    let member: any;
    let isNewMember = false;

    if (data.memberUid) {
      // Find member by uid
      member = await this.prisma.member.findUnique({
        where: { uid: data.memberUid },
        include: {
          memberApproval: true,
          teamMemberRoles: {
            include: { team: true },
          },
        },
      });

      if (!member || !['APPROVED', 'VERIFIED'].includes(member.memberApproval?.state || '')) {
        throw new BadRequestException('Member not found or is not approved');
      }

      // Check if participant already exists
      const existingParticipant = await this.prisma.demoDayParticipant.findUnique({
        where: {
          demoDayUid_memberUid: {
            demoDayUid,
            memberUid: member.uid,
          },
        },
      });

      if (existingParticipant) {
        throw new BadRequestException('Participant already exists for this demo day');
      }
    } else if (data.email) {
      // Check if member exists by email
      const existingMember = await this.prisma.member.findUnique({
        where: { email: data.email },
      });

      if (existingMember) {
        // Check if participant already exists
        const existingParticipant = await this.prisma.demoDayParticipant.findUnique({
          where: {
            demoDayUid_memberUid: {
              demoDayUid,
              memberUid: existingMember.uid,
            },
          },
        });

        if (existingParticipant) {
          throw new BadRequestException('Participant already exists for this demo day');
        }

        member = existingMember;
        isNewMember = false;
      } else {
        // Create new member
        member = await this.prisma.member.create({
          data: {
            name: data.name || data.email,
            email: data.email,
            memberApproval: {
              create: {
                state: 'PENDING',
                reason: 'Auto-created on demo day participant addition',
              },
            },
          },
          include: {
            teamMemberRoles: {
              where: { mainTeam: true },
              include: { team: true },
            },
          },
        });
        isNewMember = true;
      }
    } else {
      throw new BadRequestException('Either memberUid or email must be provided');
    }

    // Determine team for founder type
    let teamUid: string | null = null;
    if (data.type === 'FOUNDER' && member.teamMemberRoles.length > 0) {
      teamUid = member.teamMemberRoles.find((role) => role.mainTeam)?.team.uid || member.teamMemberRoles[0].team.uid;

      // Auto-assign Founder as Team Lead of their main team
      if (teamUid) {
        await this.prisma.teamMemberRole.update({
          where: {
            memberUid_teamUid: {
              memberUid: member.uid,
              teamUid: teamUid,
            },
          },
          data: {
            teamLead: true,
          },
        });

        // Create teamFundraisingProfile if it doesn't exist
        await this.ensureTeamFundraisingProfile(teamUid, demoDayUid, actorUid);
      }
    }

    if (!isNewMember) {
      await applyDemoDayParticipantPolicyAssignments(
        this.prisma,
        member.uid,
        data.type,
        demoDayRecord.host,
        data.type === 'INVESTOR'
          ? {
              teamMemberRoles:
                member.teamMemberRoles?.map((r: { investmentTeam?: boolean | null }) => ({
                  investmentTeam: r.investmentTeam,
                })) ?? undefined,
            }
          : undefined
      );
    }

    // Determine status based on whether member was newly created or existing
    const status = isNewMember ? 'INVITED' : 'ENABLED';

    // Create participant
    const created = await this.prisma.demoDayParticipant.create({
      data: {
        demoDayUid,
        memberUid: member.uid,
        type: data.type,
        status,
        teamUid,
        statusUpdatedAt: new Date(),
      },
    });

    // Track "participant added"
    await this.analyticsService.trackEvent({
      name: 'demo-day-participant-added',
      distinctId: member.uid,
      properties: {
        demoDayUid,
        participantUid: created.uid,
        memberUid: member.uid,
        type: created.type,
        status: created.status,
        teamUid: created.teamUid || null,
        isNewMember,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
      },
    });

    return created;
  }

  private async ensureTeamFundraisingProfile(teamUid: string, demoDayUid: string, actorUid?: string): Promise<void> {
    const existingFundraisingProfile = await this.prisma.teamFundraisingProfile.findUnique({
      where: {
        teamUid_demoDayUid: {
          teamUid: teamUid,
          demoDayUid: demoDayUid,
        },
      },
    });

    if (!existingFundraisingProfile) {
      await this.prisma.teamFundraisingProfile.create({
        data: {
          teamUid: teamUid,
          demoDayUid: demoDayUid,
          lastModifiedBy: actorUid,
        },
      });
    }
  }

  async addInvestorParticipantsBulk(
    demoDayUid: string,
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
    },
    actorEmail?: string,
    adminJwt?: { memberUid?: string; uid?: string }
  ): Promise<{
    summary: InvestorBulkSummary;
    rows: InvestorBulkRowResult[];
  }> {
    const demoDayRecord = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    await this.demoDaysService.assertActorCanManageDemoDayOrThrow(actorEmail, adminJwt, demoDayUid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    const summary = {
      total: data.participants.length,
      createdUsers: 0,
      updatedUsers: 0,
      createdTeams: 0,
      updatedMemberships: 0,
      promotedToLead: 0,
      errors: 0,
    };

    const rows: InvestorBulkRowResult[] = [];

    // Pending analytics events to emit after transaction commit
    const pendingEvents: Array<{ name: string; payload: any }> = [];

    // Get all emails to check existing members and participants
    const emails = data.participants.map((p) => p.email);

    // Load existing members
    const existingMembers = await this.prisma.member.findMany({
      where: { email: { in: emails } },
      include: {
        investorProfile: true,
        teamMemberRoles: {
          include: { team: true },
        },
        demoDayParticipants: {
          where: { demoDayUid },
        },
      },
    });

    // Create maps for quick lookups
    const existingMembersByEmail = new Map(existingMembers.map((m) => [m.email, m]));
    const existingParticipantEmails = new Set(
      existingMembers.filter((m) => m.demoDayParticipants.length > 0).map((m) => m.email)
    );

    // Team cache to avoid duplicate team creation
    const teamCache = new Map<string, any>();
    // Cache for telegram handler ownership to avoid repeated lookups
    const telegramOwnerCache = new Map<string, string | null>();

    // Process each participant in a transaction
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
            rowResult.message = 'Participant already exists for this demo day';
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
              memberCreationReason: 'Auto-created on demo day participant addition',
            }
          );

          summary.createdUsers += provisioned.summaryDelta.createdUsers;
          summary.updatedUsers += provisioned.summaryDelta.updatedUsers;
          summary.createdTeams += provisioned.summaryDelta.createdTeams;
          summary.updatedMemberships += provisioned.summaryDelta.updatedMemberships;
          summary.promotedToLead += provisioned.summaryDelta.promotedToLead;

          rowResult.userId = provisioned.memberUid;
          rowResult.teamId = provisioned.orgTeamUid;
          rowResult.twitterHandler = provisioned.normalizedTwitter;
          rowResult.linkedinHandler = provisioned.normalizedLinkedin;
          rowResult.telegramHandler = provisioned.normalizedTelegram;
          rowResult.willBeTeamLead = provisioned.willBeTeamLead;

          const existedBefore = await tx.demoDayParticipant.findUnique({
            where: { demoDayUid_memberUid: { demoDayUid, memberUid: provisioned.memberUid } },
            select: { uid: true },
          });

          const upserted = await tx.demoDayParticipant.upsert({
            where: {
              demoDayUid_memberUid: { demoDayUid, memberUid: provisioned.memberUid },
            },
            update: {
              type: 'INVESTOR',
              teamUid: provisioned.orgTeamUid,
              statusUpdatedAt: new Date(),
            },
            create: {
              demoDayUid,
              memberUid: provisioned.memberUid,
              type: 'INVESTOR',
              status: provisioned.isNewUser ? 'INVITED' : 'ENABLED',
              teamUid: provisioned.orgTeamUid,
              statusUpdatedAt: new Date(),
            },
          });

          if (!provisioned.isNewUser) {
            const rolesAfter = await tx.teamMemberRole.findMany({
              where: { memberUid: provisioned.memberUid },
              select: { investmentTeam: true },
            });
            await applyDemoDayParticipantPolicyAssignments(tx, provisioned.memberUid, 'INVESTOR', demoDayRecord.host, {
              teamMemberRoles: rolesAfter,
            });
          }

          if (!existedBefore) {
            pendingEvents.push({
              name: 'demo-day-participant-added',
              payload: {
                distinctId: provisioned.memberUid,
                properties: {
                  demoDayUid,
                  participantUid: upserted.uid,
                  memberUid: provisioned.memberUid,
                  type: upserted.type,
                  status: upserted.status,
                  teamUid: upserted.teamUid || null,
                  isNewMember: provisioned.isNewUser,
                  actorUid: actorUid || null,
                  actorEmail: actorEmail || null,
                },
              },
            });
          }

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

    setTimeout(async () => {
      for (const ev of pendingEvents) {
        await this.analyticsService.trackEvent({
          name: ev.name,
          distinctId: ev.payload.distinctId,
          properties: ev.payload.properties,
        });
      }
    }, 1000);

    return { summary, rows };
  }

  async getParticipants(
    demoDayUid: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      type?: string;
      search?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    }
  ): Promise<{
    participants: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DemoDayParticipantWhereInput = {
      demoDayUid,
      isDeleted: false,
    };

    if (params.status) {
      where.status = params.status as any;
    } else if (params.type) {
      where.status = { not: 'PENDING' } as any;
    }

    if (params.type) {
      where.type = params.type as any;
    }

    if (params.search) {
      where.OR = [
        {
          member: {
            name: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
        },
        {
          member: {
            email: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
        },
        {
          team: {
            name: {
              contains: params.search,
              mode: 'insensitive',
            },
          },
        },
      ];
    }

    const orderBy: Prisma.DemoDayParticipantOrderByWithRelationInput = {};
    if (params.sortBy) {
      switch (params.sortBy) {
        case 'createdAt':
        case 'updatedAt':
        case 'statusUpdatedAt':
        case 'type':
        case 'status':
          orderBy[params.sortBy] = params.sortOrder || 'desc';
          break;
        default:
          orderBy.createdAt = 'desc';
      }
    } else {
      orderBy.createdAt = 'desc';
    }

    const [participants, total] = await Promise.all([
      this.prisma.demoDayParticipant.findMany({
        where,
        include: {
          member: {
            select: {
              uid: true,
              name: true,
              imageUid: true,
              externalId: true,
              image: {
                select: {
                  uid: true,
                  url: true,
                },
              },
              email: true,
              memberApproval: {
                select: {
                  state: true,
                },
              },
              linkedinHandler: true,
              teamMemberRoles: {
                select: {
                  mainTeam: true,
                  teamLead: true,
                  role: true,
                  team: {
                    select: {
                      uid: true,
                      name: true,
                    },
                  },
                },
              },
              investorProfile: true,
            },
          },
          team: {
            select: {
              uid: true,
              name: true,
              logo: {
                select: {
                  uid: true,
                  url: true,
                },
              },
              fundraisingProfiles: {
                where: {
                  demoDayUid,
                },
                select: {
                  uid: true,
                  status: true,
                  onePagerUpload: {
                    select: {
                      uid: true,
                      url: true,
                      filename: true,
                    },
                  },
                  videoUpload: {
                    select: {
                      uid: true,
                      url: true,
                      filename: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.demoDayParticipant.count({ where }),
    ]);

    return {
      participants,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async updateParticipant(
    demoDayUid: string,
    participantUid: string,
    data: {
      status?: 'INVITED' | 'ENABLED' | 'DISABLED';
      teamUid?: string;
      type?: 'INVESTOR' | 'FOUNDER' | 'SUPPORT';
      hasEarlyAccess?: boolean;
      isDemoDayAdmin?: boolean;
      isDemoDayReadOnlyAdmin?: boolean;
    },
    actorEmail?: string,
    adminJwt?: { memberUid?: string; uid?: string }
  ): Promise<DemoDayParticipant> {
    await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    await this.demoDaysService.assertActorCanManageDemoDayOrThrow(actorEmail, adminJwt, demoDayUid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    const participant = await this.prisma.demoDayParticipant.findUnique({
      where: { uid: participantUid },
      include: {
        demoDay: { select: { host: true } },
        member: {
          include: {
            teamMemberRoles: {
              include: {
                team: true,
              },
            },
            memberApproval: true,
          },
        },
      },
    });

    if (!participant || participant.demoDayUid !== demoDayUid) {
      throw new NotFoundException('Participant not found');
    }

    const currentType = data.type || participant.type;

    // Validate team assignment for founder type only
    if (data.teamUid && currentType !== 'FOUNDER') {
      throw new BadRequestException('Team can only be assigned to founder type participants');
    }

    const updateData: Prisma.DemoDayParticipantUpdateInput = {};

    // Keep previous status and type for analytics
    const prevStatus = participant.status;
    const prevType = participant.type;

    if (data.status) {
      updateData.status = data.status;
      updateData.statusUpdatedAt = new Date();

      if (data.status === 'ENABLED' && participant.status !== 'ENABLED') {
        const participantType = data.type || participant.type;
        if (participant.memberUid) {
          await this.prisma.memberApproval.upsert({
            where: { memberUid: participant.memberUid },
            update: {
              state: 'APPROVED',
              reason: 'Demo day participant enabled',
              reviewedAt: new Date(),
            },
            create: {
              memberUid: participant.memberUid,
              state: 'APPROVED',
              requestedByUid: participant.memberUid,
              reviewedByUid: null,
              reason: 'Demo day participant enabled',
              reviewedAt: new Date(),
            },
          });

          await this.prisma.member.update({
            where: { uid: participant.memberUid },
            data: { isVerified: true },
          });

          await applyDemoDayParticipantPolicyAssignments(
            this.prisma,
            participant.memberUid,
            participantType,
            participant.demoDay?.host,
            participantType === 'INVESTOR'
              ? {
                  teamMemberRoles:
                    participant.member?.teamMemberRoles?.map((r) => ({
                      investmentTeam: r.investmentTeam,
                    })) ?? undefined,
                }
              : undefined
          );
        }

        // Identify fund teams at L0 before promotion (for enrichment)
        const fundTeamsAtL0 =
          participant.member?.teamMemberRoles
            ?.filter((role) => role.teamLead && role.team.accessLevel === 'L0')
            .map((role) => role.team.uid) || [];

        // Promote teams where this member is a lead to L1
        const teamUidsToUpdate =
          participant.member?.teamMemberRoles?.filter((role) => role.teamLead).map((role) => role.team.uid) || [];

        if (teamUidsToUpdate.length > 0) {
          await Promise.all(
            teamUidsToUpdate.map((teamUid) => this.teamService.updateTeamAccessLevel(teamUid, undefined, 'L1'))
          );
        }

        // Mark qualifying fund teams for AI enrichment
        for (const teamUid of fundTeamsAtL0) {
          await this.teamEnrichmentService.markTeamForEnrichment(teamUid);
        }
      }
    }

    // Handle type change and auto-assign/remove teamUid
    if (data.type && data.type !== participant.type) {
      updateData.type = data.type;

      // If changing from INVESTOR or SUPPORT to FOUNDER, auto-assign main team
      if (data.type === 'FOUNDER' && (participant.type === 'INVESTOR' || participant.type === 'SUPPORT')) {
        const mainTeam = participant.member?.teamMemberRoles.find((role) => role.mainTeam);
        const teamUid = mainTeam?.team.uid || participant.member?.teamMemberRoles[0]?.team.uid;

        if (teamUid) {
          updateData.team = { connect: { uid: teamUid } };
          // Ensure teamFundraisingProfile exists
          await this.ensureTeamFundraisingProfile(teamUid, demoDayUid, actorUid);
        }
      }

      // If changing from FOUNDER to non-FOUNDER (INVESTOR or SUPPORT), remove the team
      if (data.type !== 'FOUNDER' && participant.type === 'FOUNDER') {
        updateData.team = { disconnect: true };
      }
    }

    if (data.teamUid !== undefined) {
      updateData.team = data.teamUid ? { connect: { uid: data.teamUid } } : { disconnect: true };

      // Ensure teamFundraisingProfile exists when assigning a team to FOUNDER participant
      if (data.teamUid && currentType === 'FOUNDER') {
        await this.ensureTeamFundraisingProfile(data.teamUid, demoDayUid, actorUid);
      }
    }

    if (data.hasEarlyAccess !== undefined) {
      updateData.hasEarlyAccess = data.hasEarlyAccess;
    }

    if (data.isDemoDayAdmin !== undefined) {
      updateData.isDemoDayAdmin = data.isDemoDayAdmin;
      if (data.isDemoDayAdmin) {
        updateData.isDemoDayReadOnlyAdmin = false; // mutually exclusive
      }
    }

    if (data.isDemoDayReadOnlyAdmin !== undefined) {
      updateData.isDemoDayReadOnlyAdmin = data.isDemoDayReadOnlyAdmin;
      if (data.isDemoDayReadOnlyAdmin) {
        updateData.isDemoDayAdmin = false; // mutually exclusive
      }
    }

    const updated = await this.prisma.demoDayParticipant.update({
      where: { uid: participantUid },
      data: updateData,
    });

    // Track status change only when it actually changed
    if (data.status && prevStatus !== updated.status) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-participant-status-changed',
        distinctId: updated.memberUid,
        properties: {
          demoDayUid,
          participantUid: updated.uid,
          memberUid: updated.memberUid,
          type: updated.type,
          fromStatus: prevStatus,
          toStatus: updated.status,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });

      // Track "participant added" event when approved (ENABLED) - same as bulk upload
      if (updated.status === 'ENABLED') {
        await this.analyticsService.trackEvent({
          name: 'demo-day-participant-added',
          distinctId: updated.memberUid,
          properties: {
            demoDayUid,
            participantUid: updated.uid,
            memberUid: updated.memberUid,
            type: updated.type,
            status: updated.status,
            teamUid: updated.teamUid || null,
            isNewMember: false,
            actorUid: actorUid || null,
            actorEmail: actorEmail || null,
          },
        });
      }
    }

    // Track type change only when it actually changed
    if (data.type && prevType !== updated.type) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-participant-type-changed',
        distinctId: updated.memberUid,
        properties: {
          demoDayUid,
          participantUid: updated.uid,
          memberUid: updated.memberUid,
          fromType: prevType,
          toType: updated.type,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    return updated;
  }
}

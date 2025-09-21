import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DemoDayParticipant, Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';

@Injectable()
export class DemoDayParticipantsService {
  constructor(private readonly prisma: PrismaService, private readonly demoDaysService: DemoDaysService) {}

  async addParticipant(
    demoDayUid: string,
    data: {
      memberUid?: string;
      email?: string;
      name?: string;
      type: 'INVESTOR' | 'FOUNDER';
    }
  ): Promise<DemoDayParticipant> {
    await this.demoDaysService.getDemoDayByUid(demoDayUid);

    let member: any;
    let isNewMember = false;

    if (data.memberUid) {
      // Find member by uid
      member = await this.prisma.member.findUnique({
        where: { uid: data.memberUid },
        include: {
          teamMemberRoles: {
            include: { team: true },
          },
        },
      });

      if (!member || ['L0', 'L1', 'Rejected'].includes(member.accessLevel || '')) {
        throw new BadRequestException('Member not found or has invalid access level');
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
            accessLevel: 'L0',
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
      }
    }

    // Determine status based on whether member was newly created or existing
    const status = isNewMember ? 'INVITED' : 'ENABLED';

    return this.prisma.demoDayParticipant.create({
      data: {
        demoDayUid,
        memberUid: member.uid,
        type: data.type,
        status,
        teamUid,
        statusUpdatedAt: new Date(),
      },
    });
  }

  private normalizeTwitterHandler(handler?: string): string | undefined {
    if (!handler) return undefined;

    // Remove @ prefix if present
    let normalized = handler.trim().replace(/^@/, '');

    // Extract handle from Twitter URLs
    const twitterUrlMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/);
    if (twitterUrlMatch) {
      normalized = twitterUrlMatch[1];
    }

    return normalized || undefined;
  }

  private normalizeLinkedinHandler(handler?: string): string | undefined {
    if (!handler) return undefined;

    const trimmed = handler.trim();

    // Extract handle from LinkedIn URLs
    const linkedinUrlMatch = trimmed.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/([a-zA-Z0-9-]+)/);
    if (linkedinUrlMatch) {
      return linkedinUrlMatch[1];
    }

    return trimmed || undefined;
  }

  async addParticipantsBulk(
    demoDayUid: string,
    data: {
      participants: Array<{
        email: string;
        name: string;
        organization?: string | null;
        twitterHandler?: string | null;
        linkedinHandler?: string | null;
        makeTeamLead?: boolean;
      }>;
      type: 'INVESTOR' | 'FOUNDER';
    }
  ): Promise<{
    summary: {
      total: number;
      createdUsers: number;
      updatedUsers: number;
      createdTeams: number;
      updatedMemberships: number;
      promotedToLead: number;
      errors: number;
    };
    rows: Array<{
      email: string;
      name: string;
      organization?: string | null;
      twitterHandler?: string | null;
      linkedinHandler?: string | null;
      makeTeamLead?: boolean;
      willBeTeamLead: boolean;
      status: 'success' | 'error';
      message?: string;
      userId?: string;
      teamId?: string;
      membershipRole?: 'LEAD' | 'MEMBER' | 'NONE';
    }>;
  }> {
    await this.demoDaysService.getDemoDayByUid(demoDayUid);

    const summary = {
      total: data.participants.length,
      createdUsers: 0,
      updatedUsers: 0,
      createdTeams: 0,
      updatedMemberships: 0,
      promotedToLead: 0,
      errors: 0,
    };

    const rows: Array<{
      email: string;
      name: string;
      organization?: string | null;
      twitterHandler?: string | null;
      linkedinHandler?: string | null;
      makeTeamLead?: boolean;
      willBeTeamLead: boolean;
      status: 'success' | 'error';
      message?: string;
      userId?: string;
      teamId?: string;
      membershipRole?: 'LEAD' | 'MEMBER' | 'NONE';
    }> = [];

    // Get all emails to check existing members and participants
    const emails = data.participants.map((p) => p.email);

    // Load existing members
    const existingMembers = await this.prisma.member.findMany({
      where: { email: { in: emails } },
      include: {
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

    // Process each participant in a transaction
    await this.prisma.$transaction(async (tx) => {
      for (const participantData of data.participants) {
        try {
          // Normalize social media handles
          const normalizedTwitter = this.normalizeTwitterHandler(participantData.twitterHandler || undefined);
          const normalizedLinkedin = this.normalizeLinkedinHandler(participantData.linkedinHandler || undefined);

          let willBeTeamLead = false;

          if (participantData.organization) {
            willBeTeamLead = typeof participantData.makeTeamLead === 'boolean' ? participantData.makeTeamLead : true;
          }

          const rowResult: {
            email: string;
            name: string;
            organization?: string | null;
            twitterHandler?: string;
            linkedinHandler?: string;
            makeTeamLead?: boolean;
            willBeTeamLead: boolean;
            status: 'success' | 'error';
            message?: string;
            userId?: string;
            teamId?: string;
            membershipRole?: 'LEAD' | 'MEMBER' | 'NONE';
          } = {
            email: participantData.email,
            name: participantData.name,
            organization: participantData.organization,
            twitterHandler: normalizedTwitter,
            linkedinHandler: normalizedLinkedin,
            makeTeamLead: participantData.makeTeamLead,
            willBeTeamLead,
            status: 'success',
            membershipRole: 'NONE',
          };

          // Check if participant already exists for this demo day
          if (existingParticipantEmails.has(participantData.email)) {
            rowResult.status = 'error';
            rowResult.message = 'Participant already exists for this demo day';
            rows.push(rowResult);
            summary.errors++;
            continue;
          }

          const existingMember = existingMembersByEmail.get(participantData.email);
          let memberUid: string;
          let isNewUser = false;

          if (existingMember) {
            // Update existing member
            memberUid = existingMember.uid;
            await tx.member.update({
              where: { uid: memberUid },
              data: {
                name: participantData.name,
                twitterHandler: normalizedTwitter,
                linkedinHandler: normalizedLinkedin,
              },
            });
            summary.updatedUsers++;
          } else {
            // Create new member
            const newMember = await tx.member.create({
              data: {
                name: participantData.name,
                email: participantData.email,
                twitterHandler: normalizedTwitter,
                linkedinHandler: normalizedLinkedin,
                accessLevel: 'L0',
              },
            });
            memberUid = newMember.uid;
            isNewUser = true;
            summary.createdUsers++;
          }

          rowResult.userId = memberUid;

          // Handle team logic if organization is provided
          let teamUid: string | undefined;
          if (participantData.organization) {
            const orgName = participantData.organization.trim();

            // Check cache first
            let team = teamCache.get(orgName.toLowerCase());

            if (!team) {
              // Try to find existing team (case-insensitive)
              team = await tx.team.findFirst({
                where: {
                  name: {
                    equals: orgName,
                    mode: 'insensitive',
                  },
                },
              });

              if (!team) {
                // Create new team
                team = await tx.team.create({
                  data: {
                    name: orgName,
                  },
                });
                summary.createdTeams++;
              }

              // Cache the team
              teamCache.set(orgName.toLowerCase(), team);
            }

            teamUid = team.uid;
            rowResult.teamId = teamUid;

            // Upsert TeamMemberRole - teamUid is guaranteed to exist here
            if (teamUid) {
              const existingRole = await tx.teamMemberRole.findUnique({
                where: {
                  memberUid_teamUid: { memberUid, teamUid },
                },
              });

              if (existingRole) {
                // Update existing role - only promote to lead, never downgrade
                if (willBeTeamLead && !existingRole.teamLead) {
                  await tx.teamMemberRole.update({
                    where: {
                      memberUid_teamUid: { memberUid, teamUid },
                    },
                    data: {
                      teamLead: true,
                    },
                  });
                  summary.promotedToLead++;
                  rowResult.membershipRole = 'LEAD';
                } else {
                  rowResult.membershipRole = existingRole.teamLead ? 'LEAD' : 'MEMBER';
                }
              } else {
                // Create new team membership
                await tx.teamMemberRole.create({
                  data: {
                    memberUid,
                    teamUid,
                    teamLead: willBeTeamLead,
                    role: 'MEMBER',
                  },
                });
                summary.updatedMemberships++;
                rowResult.membershipRole = willBeTeamLead ? 'LEAD' : 'MEMBER';

                if (willBeTeamLead) {
                  summary.promotedToLead++;
                }
              }
            }
          }

          // Create/update DemoDayParticipant
          await tx.demoDayParticipant.upsert({
            where: {
              demoDayUid_memberUid: { demoDayUid, memberUid },
            },
            update: {
              type: data.type,
              teamUid,
              statusUpdatedAt: new Date(),
            },
            create: {
              demoDayUid,
              memberUid,
              type: data.type,
              status: isNewUser ? 'INVITED' : 'ENABLED',
              teamUid,
              statusUpdatedAt: new Date(),
            },
          });

          rows.push(rowResult);
        } catch (error) {
          summary.errors++;
          rows.push({
            email: participantData.email,
            name: participantData.name,
            organization: participantData.organization,
            twitterHandler: participantData.twitterHandler || undefined,
            linkedinHandler: participantData.linkedinHandler || undefined,
            makeTeamLead: participantData.makeTeamLead,
            willBeTeamLead: participantData.organization ? true : participantData.makeTeamLead || false,
            status: 'error',
            message: error instanceof Error ? error.message : 'Unknown error occurred',
            membershipRole: 'NONE',
          });
        }
      }
    });

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
    await this.demoDaysService.getDemoDayByUid(demoDayUid);

    const page = params.page || 1;
    const limit = params.limit || 10;
    const skip = (page - 1) * limit;

    const where: Prisma.DemoDayParticipantWhereInput = {
      demoDayUid,
      isDeleted: false,
    };

    if (params.status) {
      where.status = params.status as any;
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
              image: {
                select: {
                  uid: true,
                  url: true,
                },
              },
              email: true,
              accessLevel: true,
              accessLevelUpdatedAt: true,
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
    }
  ): Promise<DemoDayParticipant> {
    await this.demoDaysService.getDemoDayByUid(demoDayUid);

    const participant = await this.prisma.demoDayParticipant.findUnique({
      where: { uid: participantUid },
    });

    if (!participant || participant.demoDayUid !== demoDayUid) {
      throw new NotFoundException('Participant not found');
    }

    // Validate team assignment for founder type only
    if (data.teamUid && participant.type !== 'FOUNDER') {
      throw new BadRequestException('Team can only be assigned to founder type participants');
    }

    const updateData: Prisma.DemoDayParticipantUpdateInput = {};

    if (data.status) {
      updateData.status = data.status;
      updateData.statusUpdatedAt = new Date();
    }

    if (data.teamUid !== undefined) {
      updateData.team = data.teamUid ? { connect: { uid: data.teamUid } } : { disconnect: true };
    }

    return this.prisma.demoDayParticipant.update({
      where: { uid: participantUid },
      data: updateData,
    });
  }
}

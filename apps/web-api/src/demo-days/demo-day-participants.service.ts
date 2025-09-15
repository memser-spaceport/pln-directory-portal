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

  async addParticipantsBulk(
    demoDayUid: string,
    data: {
      members: { email: string; name?: string }[];
      type: 'INVESTOR' | 'FOUNDER';
    }
  ): Promise<{ status: 'SUCCESS' | 'FAIL'; failedMembers: { email: string; name?: string }[] }> {
    await this.demoDaysService.getDemoDayByUid(demoDayUid);
    const failedMembers: { email: string; name?: string }[] = [];

    // Get all emails to check existing members and participants
    const emails = data.members.map((m) => m.email);

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

    // Load existing participants for this demo day
    const existingParticipantEmails = new Set(
      existingMembers.filter((m) => m.demoDayParticipants.length > 0).map((m) => m.email)
    );

    const membersToCreate: { name: string; email: string; accessLevel: string }[] = [];
    const participantsToCreate: {
      demoDayUid: string;
      memberUid: string;
      type: 'INVESTOR' | 'FOUNDER';
      status: 'INVITED' | 'ENABLED';
      teamUid?: string;
      statusUpdatedAt: Date;
    }[] = [];

    for (const memberData of data.members) {
      try {
        // Skip if participant already exists
        if (existingParticipantEmails.has(memberData.email)) {
          failedMembers.push(memberData);
          continue;
        }

        const existingMember = existingMembers.find((m) => m.email === memberData.email);

        if (existingMember) {
          // Check access level
          if (['L0', 'L1', 'Rejected'].includes(existingMember.accessLevel || '')) {
            failedMembers.push(memberData);
            continue;
          }

          // Determine team for founder type
          let teamUid: string | undefined;
          if (data.type === 'FOUNDER' && existingMember.teamMemberRoles.length > 0) {
            teamUid =
              existingMember.teamMemberRoles.find((role) => role.mainTeam)?.team.uid ||
              existingMember.teamMemberRoles[0].team.uid;
          }

          participantsToCreate.push({
            demoDayUid,
            memberUid: existingMember.uid,
            type: data.type,
            status: 'ENABLED',
            teamUid,
            statusUpdatedAt: new Date(),
          });
        } else {
          // Member doesn't exist, will create new one
          const memberUid = `temp_${memberData.email}_${Date.now()}`;
          membersToCreate.push({
            name: memberData.name || memberData.email,
            email: memberData.email,
            accessLevel: 'L0',
          });

          participantsToCreate.push({
            demoDayUid,
            memberUid, // This will be replaced with actual uid after creation
            type: data.type,
            status: 'INVITED',
            statusUpdatedAt: new Date(),
          });
        }
      } catch (error) {
        failedMembers.push(memberData);
      }
    }

    // Create members and participants in transaction
    await this.prisma.$transaction(async (tx) => {
      // Create new members
      if (membersToCreate.length > 0) {
        const createdMembers = await Promise.all(
          membersToCreate.map((memberData) =>
            tx.member.create({
              data: memberData,
            })
          )
        );

        // Update participant data with actual member uids
        let createdMemberIndex = 0;
        for (let i = 0; i < participantsToCreate.length; i++) {
          if (participantsToCreate[i].memberUid.startsWith('temp_')) {
            participantsToCreate[i].memberUid = createdMembers[createdMemberIndex].uid;
            createdMemberIndex++;
          }
        }
      }

      // Create participants
      if (participantsToCreate.length > 0) {
        await tx.demoDayParticipant.createMany({
          data: participantsToCreate,
        });
      }
    });

    return {
      status: failedMembers.length === 0 ? 'SUCCESS' : 'FAIL',
      failedMembers,
    };
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

import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { DemoDaysService } from './demo-days.service';

@Injectable()
export class DemoDayTeamLeadRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly demoDaysService: DemoDaysService
  ) {}

  async createRequest(userEmail: string, demoDayUidOrSlug: string) {
    const demoDay = await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUidOrSlug);

    const member = await this.prisma.member.findUnique({
      where: { email: userEmail },
      select: { uid: true },
    });

    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const participant = await this.prisma.demoDayParticipant.findUnique({
      where: {
        demoDayUid_memberUid: {
          demoDayUid: demoDay.uid,
          memberUid: member.uid,
        },
      },
    });

    if (!participant) {
      throw new NotFoundException('Participant not found for this demo day');
    }

    if (participant.type !== 'FOUNDER') {
      throw new BadRequestException('Only founder participants can request team lead status');
    }

    if (!participant.teamUid) {
      throw new BadRequestException('Participant must have a team assigned to request team lead status');
    }

    // Check if already a team lead
    const teamMemberRole = await this.prisma.teamMemberRole.findUnique({
      where: {
        memberUid_teamUid: {
          memberUid: member.uid,
          teamUid: participant.teamUid,
        },
      },
    });

    if (teamMemberRole?.teamLead) {
      throw new BadRequestException('You are already a team lead for this team');
    }

    if (participant.teamLeadRequestStatus === 'REQUESTED') {
      throw new BadRequestException('A team lead request is already pending');
    }

    const updated = await this.prisma.demoDayParticipant.update({
      where: { uid: participant.uid },
      data: { teamLeadRequestStatus: 'REQUESTED' },
    });

    return { success: true, teamLeadRequestStatus: updated.teamLeadRequestStatus };
  }

  async getRequests(
    demoDayUid: string,
    params: {
      page?: number;
      limit?: number;
      status?: string;
      search?: string;
    }
  ): Promise<{
    requests: any[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const where: Prisma.DemoDayParticipantWhereInput = {
      demoDayUid,
      isDeleted: false,
      teamLeadRequestStatus: { not: null },
    };

    if (params.status) {
      where.teamLeadRequestStatus = params.status as any;
    }

    if (params.search) {
      where.OR = [
        {
          member: {
            name: { contains: params.search, mode: 'insensitive' },
          },
        },
        {
          member: {
            email: { contains: params.search, mode: 'insensitive' },
          },
        },
        {
          team: {
            name: { contains: params.search, mode: 'insensitive' },
          },
        },
      ];
    }

    const [requests, total] = await Promise.all([
      this.prisma.demoDayParticipant.findMany({
        where,
        include: {
          member: {
            select: {
              uid: true,
              name: true,
              email: true,
              image: {
                select: {
                  uid: true,
                  url: true,
                },
              },
            },
          },
          team: {
            select: {
              uid: true,
              name: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.demoDayParticipant.count({ where }),
    ]);

    return {
      requests,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async reviewRequest(
    demoDayUid: string,
    participantUid: string,
    action: 'APPROVE' | 'REJECT',
    actorEmail: string
  ) {
    await this.demoDaysService.getDemoDayByUidOrSlug(demoDayUid);

    const participant = await this.prisma.demoDayParticipant.findUnique({
      where: { uid: participantUid },
    });

    if (!participant || participant.demoDayUid !== demoDayUid) {
      throw new NotFoundException('Participant not found');
    }

    if (participant.teamLeadRequestStatus !== 'REQUESTED') {
      throw new BadRequestException('This request is not in a pending state');
    }

    if (!participant.teamUid) {
      throw new BadRequestException('Participant does not have a team assigned');
    }

    if (action === 'APPROVE') {
      await this.prisma.$transaction([
        this.prisma.teamMemberRole.update({
          where: {
            memberUid_teamUid: {
              memberUid: participant.memberUid,
              teamUid: participant.teamUid,
            },
          },
          data: { teamLead: true },
        }),
        this.prisma.demoDayParticipant.update({
          where: { uid: participantUid },
          data: { teamLeadRequestStatus: 'APPROVED' },
        }),
      ]);

      return { success: true, teamLeadRequestStatus: 'APPROVED' };
    }

    // REJECT
    await this.prisma.demoDayParticipant.update({
      where: { uid: participantUid },
      data: { teamLeadRequestStatus: 'REJECTED' },
    });

    return { success: true, teamLeadRequestStatus: 'REJECTED' };
  }
}

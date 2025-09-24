import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class DemoDaysService {
  constructor(private readonly prisma: PrismaService) {}

  async getCurrentDemoDay(): Promise<DemoDay | null> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: {
          in: [DemoDayStatus.UPCOMING, DemoDayStatus.ACTIVE, DemoDayStatus.COMPLETED],
        },
        isDeleted: false,
      },
    });

    return demoDay;
  }

  async getCurrentDemoDayAccess(memberEmail: string | null): Promise<{
    access: 'none' | 'INVESTOR' | 'FOUNDER';
    status: 'NONE' | 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
    uid?: string;
    date?: string;
    title?: string;
    description?: string;
    teamsCount?: number;
    investorsCount?: number;
  }> {
    const demoDay = await this.getCurrentDemoDay();
    if (!demoDay) {
      return {
        access: 'none',
        status: 'NONE',
        teamsCount: 0,
        investorsCount: 0,
      };
    }

    const investorsCount = await this.prisma.demoDayParticipant.count({
      where: {
        demoDayUid: demoDay.uid,
        isDeleted: false,
        status: 'ENABLED',
        type: 'INVESTOR',
      },
    });

    // Count teams using fundraising profile logic:
    // - profile must be PUBLISHED
    // - must have onePager and video uploaded
    // - team must have at least one ENABLED FOUNDER participant in this demo day
    const teamsCount = await this.prisma.teamFundraisingProfile.count({
      where: {
        demoDayUid: demoDay.uid,
        status: 'PUBLISHED',
        onePagerUploadUid: { not: null },
        videoUploadUid: { not: null },
        team: {
          demoDayParticipants: {
            some: {
              demoDayUid: demoDay.uid,
              isDeleted: false,
              status: 'ENABLED',
              type: 'FOUNDER',
            },
          },
        },
      },
    });

    // Handle unauthorized users
    if (!memberEmail) {
      return {
        access: 'none',
        status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
      };
    }

    // Get member by email
    const member = await this.prisma.member.findUnique({
      where: { email: memberEmail },
      select: {
        uid: true,
        accessLevel: true,
        memberRoles: {
          select: {
            name: true,
          },
        },
        demoDayParticipants: {
          where: {
            demoDayUid: demoDay.uid,
            isDeleted: false,
          },
          select: {
            status: true,
            type: true,
          },
        },
      },
    });

    if (!member) {
      return {
        access: 'none',
        status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
      };
    }

    // Check if member is directory admin
    const roleNames = member.memberRoles.map((role) => role.name);
    const isDirectoryAdmin = roleNames.includes('DIRECTORYADMIN');

    // Check demo day participant
    const participant = member.demoDayParticipants[0];
    if (participant && participant.status !== 'ENABLED') {
      return {
        access: 'none',
        status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
      };
    }

    if (participant && participant.status === 'ENABLED') {
      // Member is an enabled participant
      const access = participant.type === 'INVESTOR' ? 'INVESTOR' : 'FOUNDER';
      return {
        access,
        uid: demoDay.uid,
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
        teamsCount,
        investorsCount,
      };
    }

    return {
      access: 'none',
      status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
    };
  }

  // Admin methods

  async createDemoDay(data: {
    startDate: Date;
    title: string;
    description: string;
    status: DemoDayStatus;
  }): Promise<DemoDay> {
    return this.prisma.demoDay.create({
      data: {
        startDate: data.startDate,
        title: data.title,
        description: data.description,
        status: data.status,
      },
    });
  }

  async getAllDemoDays(): Promise<DemoDay[]> {
    return this.prisma.demoDay.findMany({
      where: { isDeleted: false },
      select: {
        id: true,
        uid: true,
        startDate: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDemoDayByUid(uid: string): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: { uid, isDeleted: false },
      select: {
        id: true,
        uid: true,
        startDate: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });

    if (!demoDay) {
      throw new NotFoundException(`Demo day with uid ${uid} not found`);
    }

    return demoDay;
  }

  async updateDemoDay(
    uid: string,
    data: {
      startDate?: Date;
      title?: string;
      description?: string;
      status?: DemoDayStatus;
    }
  ): Promise<DemoDay> {
    // First check if demo day exists
    await this.getDemoDayByUid(uid);

    const updateData: any = {};

    if (data.startDate !== undefined) {
      updateData.startDate = data.startDate;
    }
    if (data.title !== undefined) {
      updateData.title = data.title;
    }
    if (data.description !== undefined) {
      updateData.description = data.description;
    }
    if (data.status !== undefined) {
      updateData.status = data.status;
    }

    return this.prisma.demoDay.update({
      where: { uid },
      data: updateData,
      select: {
        id: true,
        uid: true,
        startDate: true,
        title: true,
        description: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        isDeleted: true,
        deletedAt: true,
      },
    });
  }
}

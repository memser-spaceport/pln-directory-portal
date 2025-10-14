import { Injectable, NotFoundException } from '@nestjs/common';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';

@Injectable()
export class DemoDaysService {
  constructor(private readonly prisma: PrismaService, private readonly analyticsService: AnalyticsService) {}

  async getCurrentDemoDay(): Promise<DemoDay | null> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: {
          in: [DemoDayStatus.UPCOMING, DemoDayStatus.ACTIVE, DemoDayStatus.COMPLETED],
        },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
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
    isDemoDayAdmin?: boolean;
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

    // Handle unauthorized users
    if (!memberEmail) {
      return {
        access: 'none',
        status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        teamsCount: 0,
        investorsCount: 0,
      };
    }

    const [investorsCount, teamsCount, member] = await Promise.all([
      this.prisma.member.count({
        where: {
          accessLevel: {
            in: ['L5', 'L6'],
          },
          investorProfile: {
            type: { not: null },
          },
        },
      }),
      this.prisma.teamFundraisingProfile.count({
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
      }),
      this.prisma.member.findUnique({
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
              uid: true,
              status: true,
              type: true,
              isDemoDayAdmin: true,
            },
          },
        },
      }),
    ]);

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
        date: demoDay.startDate.toISOString(),
        title: demoDay.title,
        description: demoDay.description,
        teamsCount,
        investorsCount,
      };
    }

    if (participant && participant.status === 'INVITED') {
      participant.status = 'ENABLED';
      await this.prisma.demoDayParticipant.update({
        where: { uid: participant.uid },
        data: { status: 'ENABLED' },
      });
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
        isDemoDayAdmin: participant.isDemoDayAdmin || isDirectoryAdmin,
        teamsCount,
        investorsCount,
      };
    }

    return {
      access: 'none',
      status: demoDay.status.toUpperCase() as 'UPCOMING' | 'ACTIVE' | 'COMPLETED',
      date: demoDay.startDate.toISOString(),
      title: demoDay.title,
      description: demoDay.description,
      teamsCount,
      investorsCount,
    };
  }

  // Admin methods

  async createDemoDay(
    data: {
      startDate: Date;
      title: string;
      description: string;
      status: DemoDayStatus;
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

    const created = await this.prisma.demoDay.create({
      data: {
        startDate: data.startDate,
        title: data.title,
        description: data.description,
        status: data.status,
      },
    });

    // Track "Demo Day created"
    await this.analyticsService.trackEvent({
      name: 'demo-day-created',
      distinctId: created.uid,
      properties: {
        demoDayUid: created.uid,
        title: created.title,
        description: created.description,
        startDate: created.startDate?.toISOString?.() || null,
        status: created.status,
        actorUid: actorUid || null,
        actorEmail: actorEmail || null,
      },
    });

    return created;
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
    },
    actorEmail?: string
  ): Promise<DemoDay> {
    // First check if demo day exists
    const before = await this.getDemoDayByUid(uid);

    // resolve actor (optional)
    let actorUid: string | undefined;
    if (actorEmail) {
      const actor = await this.prisma.member.findUnique({ where: { email: actorEmail }, select: { uid: true } });
      actorUid = actor?.uid;
    }

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

    const updated = await this.prisma.demoDay.update({
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

    // Track "details updated" (name/description/startDate) only if any changed
    const detailsChanged: string[] = [];
    if (updateData.title !== undefined && before.title !== updated.title) detailsChanged.push('title');
    if (updateData.description !== undefined && before.description !== updated.description)
      detailsChanged.push('description');
    if (updateData.startDate !== undefined && before.startDate?.toISOString?.() !== updated.startDate?.toISOString?.())
      detailsChanged.push('startDate');

    if (detailsChanged.length > 0) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-details-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          changedFields: detailsChanged,
          title: updated.title,
          description: updated.description,
          startDate: updated.startDate?.toISOString?.() || null,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    // Track "status updated" if changed
    if (updateData.status !== undefined && before.status !== updated.status) {
      await this.analyticsService.trackEvent({
        name: 'demo-day-status-updated',
        distinctId: updated.uid,
        properties: {
          demoDayUid: updated.uid,
          fromStatus: before.status,
          toStatus: updated.status,
          actorUid: actorUid || null,
          actorEmail: actorEmail || null,
        },
      });
    }

    return updated;
  }
}

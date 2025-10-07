import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { DemoDay, DemoDayStatus } from '@prisma/client';
import cuid from 'cuid';

@Injectable()
export class DemoDayEngagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly analyticsService: AnalyticsService
  ) {}

  // Resolve most recent non-deleted Demo Day (UPCOMING/ACTIVE/COMPLETED)
  private async resolveCurrentDemoDay(): Promise<DemoDay> {
    const demoDay = await this.prisma.demoDay.findFirst({
      where: {
        status: { in: [DemoDayStatus.UPCOMING, DemoDayStatus.ACTIVE, DemoDayStatus.COMPLETED] },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!demoDay) {
      throw new NotFoundException('No current Demo Day found');
    }

    return demoDay;
  }

  // Read engagement state for UI
  async getCurrentEngagement(memberEmail: string) {
    const demoDay = await this.resolveCurrentDemoDay();

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
    const demoDay = await this.resolveCurrentDemoDay();

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
}

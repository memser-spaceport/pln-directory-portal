import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma.service';


export interface GetEventsQuery {
  eventType?: string;
  userId?: string;
  sessionId?: string;
  anonymousId?: string;
  since?: string;   // ISO
  until?: string;   // ISO
  limit?: string;   // number as string
}

@Injectable()
export class AnalyticsReadService {
  constructor(private readonly prisma: PrismaService) {}

  async getEvents(q: GetEventsQuery) {
    const where: any = {};

    if (q.eventType) where.eventType = q.eventType;
    if (q.userId) where.userId = q.userId;
    if (q.sessionId) where.sessionId = q.sessionId;
    if (q.anonymousId) where.anonymousId = q.anonymousId;

    if (q.since || q.until) {
      where.ts = {};
      if (q.since) where.ts.gte = new Date(q.since);
      if (q.until) where.ts.lte = new Date(q.until);
    }

    const limitNum = Math.min(Math.max(parseInt(String(q.limit || '100'), 10) || 100, 1), 1000);

    const rows = await this.prisma.event.findMany({
      where,
      orderBy: { ts: 'desc' },
      take: limitNum,
    });

    return rows;
  }
}

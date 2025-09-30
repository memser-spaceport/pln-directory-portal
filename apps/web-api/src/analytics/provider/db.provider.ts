import { Injectable } from '@nestjs/common';
import { IAnalyticsProvider, IAnalyticsEvent } from '../analytics.interface';
import { PrismaService } from '../../shared/prisma.service';

/**
 * Database analytics provider (Postgres via Prisma)
 * Stores events into the "Event" table (jsonb).
 * Idempotency supported via properties.eventId (optional).
 */
@Injectable()
export class DbProvider implements IAnalyticsProvider {
  constructor(private readonly prisma: PrismaService) {}

  async trackEvent(event: IAnalyticsEvent): Promise<void> {
    const {
      eventId,
      userId,
      userEmail,
      anonymousId,
      sessionId,
      source,
      path,
      referrer,
      ts,
      requestIp,
      userAgent,
      ...rest
    } = (event.properties ?? {}) as Record<string, any>;

    const row = {
      eventId: eventId ?? null,
      eventType: event.name,
      userId: userId ?? event.distinctId ?? null,
      userEmail: userEmail ?? null,
      anonymousId: anonymousId ?? null,
      sessionId: sessionId ?? null,
      source: source ?? 'server',
      path: path ?? null,
      referrer: referrer ?? null,
      userAgent: userAgent ?? null,
      requestIp: requestIp ?? null,
      ts: ts ? new Date(ts) : new Date(),
      props: rest && Object.keys(rest).length ? rest : {},
    };

    if (row.eventId) {
      await this.prisma.event.upsert({
        where: { eventId: row.eventId },
        update: {},
        create: row,
      });
    } else {
      await this.prisma.event.create({ data: row });
    }
  }

  async shutdown(): Promise<void> {
    // No explicit shutdown logic required
  }
}

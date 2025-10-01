import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, Req } from '@nestjs/common';

import { Request } from 'express';
import { AnalyticsService } from './service/analytics.service';
import {AnalyticsReadService} from "./service/analytics.read.service";

class TrackEventDto {
  name!: string;
  distinctId!: string;
  properties?: Record<string, any>;
}

class BatchTrackDto {
  events!: TrackEventDto[];
}

class GetEventsQueryDto {
  eventType?: string;
  userId?: string;
  sessionId?: string;
  anonymousId?: string;
  since?: string; // ISO date
  until?: string; // ISO date
  limit?: string; // number as string
}

/**
 * REST controller for analytics ingestion & quick querying
 * - POST /analytics/track  : single event
 * - POST /analytics/batch  : multiple events
 * - GET  /analytics/events : quick filter (uses your DB provider when HYBRID/DB is active)
 */
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly analyticsReadService: AnalyticsReadService,
  ) {}

  @Post('track')
  @HttpCode(HttpStatus.OK)
  async track(@Body() dto: TrackEventDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    const ua = req.headers['user-agent'] || '';

    const properties = {
      ...(dto.properties || {}),
      requestIp: ip,
      userAgent: ua,
    };

    await this.analyticsService.trackEvent({
      name: dto.name,
      distinctId: dto.distinctId,
      properties,
    });

    return { ok: true };
  }

  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async batch(@Body() dto: BatchTrackDto, @Req() req: Request) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      '';
    const ua = req.headers['user-agent'] || '';

    await Promise.all(
      (dto.events || []).map((e) =>
        this.analyticsService.trackEvent({
          name: e.name,
          distinctId: e.distinctId,
          properties: {
            ...(e.properties || {}),
            requestIp: ip,
            userAgent: ua,
          },
        }),
      ),
    );

    return { ok: true, count: (dto.events || []).length };
  }

  /**
   * Lightweight query endpoint (for internal dashboards / debugging).
   * Note: Works when DB storage is enabled (ANALYTICS_PROVIDER=DB or HYBRID).
   * If only PostHog/Console is enabled, this returns 200 with an empty set.
   */
  @Get('events/all')
  async getEvents(@Query() q: GetEventsQueryDto) {
    const rows = await this.analyticsReadService.getEvents(q);
    return {
      ok: true,
      filters: q,
      rows,
    };
  }
}

import axios from 'axios';

// The real modules pull in transitive chains that break under ts-jest (an
// ESM-only nestjs-zod import for push-notifications, ESM axios via
// posthog-node for analytics); mock them like roadmap.service.spec.ts does.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

jest.mock('axios', () => ({ post: jest.fn() }));

import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AiAppsService } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { AI_APPS_APP_DOMAIN } from './ai-apps.constants';

const APP = {
  uid: 'app-uid-1',
  appId: 'demo',
  name: 'Demo App',
  memberUid: 'creator-1',
  status: 'READY',
  lastDeployedAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

const ORIGIN = `https://demo.${AI_APPS_APP_DOMAIN}`;

function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    aiApp: { findMany: jest.fn().mockResolvedValue([APP]) },
    member: { findFirst: jest.fn().mockResolvedValue(null) },
    ...overrides,
  };
  const analyticsService = { trackEvent: jest.fn() };
  const service = new AiAppsService(prisma as any, {} as any, { create: jest.fn() } as any, analyticsService as any);
  return { service, prisma, analyticsService };
}

beforeEach(() => {
  (axios.post as jest.Mock).mockReset();
});

describe('AiAppsService.trackAppEvent', () => {
  it('drops events from an unknown/unattributable origin', async () => {
    const { service, prisma, analyticsService } = buildService();
    prisma.aiApp.findMany.mockResolvedValue([]);
    await service.trackAppEvent({
      origin: 'https://not-an-app.example.com',
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('drops events with a missing origin header', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: undefined,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('drops guest events with a malformed anonId and no token', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'not-a-valid-anon-id',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('accepts a well-formed anon:<uuid> as the distinct id for guests', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: 'anon:11111111-1111-1111-1111-111111111111' })
    );
  });

  it('resolves a valid token to the member and uses memberUid as the distinct id', async () => {
    const { service, prisma, analyticsService } = buildService();
    (axios.post as jest.Mock).mockResolvedValue({ data: { active: true, email: 'ada@example.com' } });
    prisma.member.findFirst.mockResolvedValue({ uid: 'member-1' });

    await service.trackAppEvent({
      origin: ORIGIN,
      token: 'valid-token',
      anonId: undefined,
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });

    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'member-1',
        properties: expect.objectContaining({ memberUid: 'member-1' }),
      })
    );
  });

  it('falls back to anonId when the token is invalid/expired', async () => {
    const { service, analyticsService } = buildService();
    (axios.post as jest.Mock).mockResolvedValue({ data: { active: false } });

    await service.trackAppEvent({
      origin: ORIGIN,
      token: 'expired-token',
      anonId: 'anon:22222222-2222-2222-2222-222222222222',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });

    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: 'anon:22222222-2222-2222-2222-222222222222' })
    );
  });

  it('never throws when the introspection call errors — treats it as a guest', async () => {
    const { service, analyticsService } = buildService();
    (axios.post as jest.Mock).mockRejectedValue(new Error('network down'));

    await expect(
      service.trackAppEvent({
        origin: ORIGIN,
        token: 'some-token',
        anonId: 'anon:33333333-3333-3333-3333-333333333333',
        event: 'clicked_button',
        properties: undefined,
        events: undefined,
      })
    ).resolves.toBeUndefined();
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: 'anon:33333333-3333-3333-3333-333333333333' })
    );
  });

  it('enforces the ai_app_ prefix and snake_cases the event name', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'Clicked Export Button!',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ai_app_clicked_export_button' })
    );
  });

  it('leaves an already-prefixed event name untouched apart from normalization', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'ai_app_export_clicked',
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'ai_app_export_clicked' })
    );
  });

  it('overwrites client-sent appId/source/memberUid with server-resolved attribution', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: {
        source: 'spoofed',
        appId: 'other-app',
        appUid: 'other-uid',
        memberUid: 'spoofed-member',
        feature: 'export',
      },
      events: undefined,
    });
    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        properties: expect.objectContaining({
          source: 'ai-app',
          appId: 'demo',
          appUid: 'app-uid-1',
          appName: 'Demo App',
          feature: 'export',
        }),
      })
    );
    const { properties } = (analyticsService.trackEvent as jest.Mock).mock.calls[0][0];
    expect(properties).not.toHaveProperty('memberUid');
  });

  it('strips $-prefixed and email/name properties from the app payload', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: { $set: { plan: 'pro' }, email: 'a@b.com', name: 'Ada', feature: 'export' },
      events: undefined,
    });
    const { properties } = (analyticsService.trackEvent as jest.Mock).mock.calls[0][0];
    expect(properties).not.toHaveProperty('$set');
    expect(properties).not.toHaveProperty('email');
    expect(properties).not.toHaveProperty('name');
    expect(properties.feature).toBe('export');
  });

  it('drops an event whose properties exceed the size cap', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: { blob: 'x'.repeat(20 * 1024) },
      events: undefined,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('drops the whole batch when it exceeds the max batch size', async () => {
    const { service, analyticsService } = buildService();
    const events = Array.from({ length: 21 }, (_, i) => ({ event: `event_${i}` }));
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: undefined,
      properties: undefined,
      events,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('forwards each event in a within-limit batch', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: undefined,
      properties: undefined,
      events: [{ event: 'first' }, { event: 'second' }],
    });
    expect(analyticsService.trackEvent).toHaveBeenCalledTimes(2);
  });

  it('drops when neither a single event nor a batch is provided', async () => {
    const { service, analyticsService } = buildService();
    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: undefined,
      properties: undefined,
      events: undefined,
    });
    expect(analyticsService.trackEvent).not.toHaveBeenCalled();
  });

  it('picks the most recently deployed row when several live apps share an appId', async () => {
    const { service, prisma, analyticsService } = buildService();
    const older = { ...APP, uid: 'app-uid-old', lastDeployedAt: new Date('2025-01-01T00:00:00Z') };
    const newer = { ...APP, uid: 'app-uid-new', lastDeployedAt: new Date('2026-06-01T00:00:00Z') };
    prisma.aiApp.findMany.mockResolvedValue([older, newer]);

    await service.trackAppEvent({
      origin: ORIGIN,
      token: undefined,
      anonId: 'anon:11111111-1111-1111-1111-111111111111',
      event: 'clicked_button',
      properties: undefined,
      events: undefined,
    });

    expect(analyticsService.trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({ properties: expect.objectContaining({ appUid: 'app-uid-new' }) })
    );
  });
});

/**
 * Wiring checks for `POST /v1/ai-apps/track`. The full-app e2e path is not
 * runnable in this repo's jest setup (@nestjs/testing lags @nestjs/core), so
 * this pins the routing/guard/status metadata that matters instead.
 */
describe('AiAppsController POST /track wiring', () => {
  const handler = AiAppsController.prototype.trackEvent;

  it('registers as POST "track" with no auth guards', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('track');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toBeUndefined();
  });

  it('always responds 204 (no content)', () => {
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
  });

  it('is declared before the :uid route so the literal path wins', () => {
    const methods = Object.getOwnPropertyNames(AiAppsController.prototype);
    expect(methods.indexOf('trackEvent')).toBeGreaterThan(-1);
    expect(methods.indexOf('trackEvent')).toBeLessThan(methods.indexOf('getApp'));
  });
});

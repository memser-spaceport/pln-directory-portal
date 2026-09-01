/// <reference types="multer" />
import { NotFoundException } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA, HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';

jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { AiAppsService } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { AI_APPS_WAU_WINDOW_MS } from './ai-apps.constants';
import { AI_APPS_PERMISSIONS } from '../access-control-v2/access-control-v2.constants';
import { RBAC_PERMISSIONS_KEY } from '../rbac/rbac.decorator';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';

const UPDATED_AT = new Date('2026-08-01T00:00:00.000Z');
const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Demo',
  status: 'READY',
  notes: null,
  viewCount: 3,
  lastDeployedAt: new Date('2026-07-01T00:00:00.000Z'),
  failureStream: null,
  database: null,
  updatedAt: UPDATED_AT,
};

function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(APP),
      findMany: jest.fn().mockResolvedValue([APP]),
    },
    aiAppActiveMember: {
      groupBy: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
    ...overrides,
  };
  return {
    service: new AiAppsService(
      prisma as any,
      {} as any,
      { create: jest.fn() } as any,
      { trackEvent: jest.fn() } as any
    ),
    prisma,
  };
}

beforeEach(() => {
  jest.useRealTimers();
});

describe('AiAppsService.recordView', () => {
  it('increments viewCount via raw SQL (so updatedAt is not touched) and upserts lastSeenAt', async () => {
    const { service, prisma } = buildService();
    await service.recordView('member-1', 'app-1');

    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    expect(prisma.aiAppActiveMember.upsert).toHaveBeenCalledWith({
      where: { appUid_memberUid: { appUid: 'app-1', memberUid: 'member-1' } },
      create: { appUid: 'app-1', memberUid: 'member-1', lastSeenAt: expect.any(Date) },
      update: { lastSeenAt: expect.any(Date) },
    });
  });

  it('throws 404 when the app does not exist', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.findUnique.mockResolvedValue(null);
    await expect(service.recordView('member-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('throws 404 when the app is DELETED', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.findUnique.mockResolvedValue({ ...APP, status: 'DELETED' });
    await expect(service.recordView('member-1', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('throws 404 when the raw increment matches no row', async () => {
    const { service, prisma } = buildService();
    prisma.$executeRaw.mockResolvedValue(0);
    await expect(service.recordView('member-1', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aiAppActiveMember.upsert).not.toHaveBeenCalled();
  });
});

describe('AiAppsService list/get WAU + views', () => {
  it('listApps attaches viewCount from the row and weeklyActiveUsers from the rolling window', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.findMany.mockResolvedValueOnce([{ ...APP, viewCount: 12 }]);
    prisma.aiAppActiveMember.groupBy.mockResolvedValueOnce([{ appUid: 'app-1', _count: { _all: 4 } }]);

    const result = await service.listApps();

    expect(result[0].viewCount).toBe(12);
    expect(result[0].weeklyActiveUsers).toBe(4);
    const where = prisma.aiAppActiveMember.groupBy.mock.calls[0][0].where;
    expect(where.appUid).toEqual({ in: ['app-1'] });
    expect(where.lastSeenAt.gte.getTime()).toBeGreaterThan(Date.now() - AI_APPS_WAU_WINDOW_MS - 5_000);
  });

  it('defaults missing viewCount and empty WAU to 0', async () => {
    const { service, prisma } = buildService();
    const { viewCount: _drop, ...withoutCount } = APP;
    prisma.aiApp.findMany.mockResolvedValueOnce([withoutCount]);
    prisma.aiAppActiveMember.groupBy.mockResolvedValueOnce([]);

    const result = await service.listApps();

    expect(result[0].viewCount).toBe(0);
    expect(result[0].weeklyActiveUsers).toBe(0);
  });

  it('getApp attaches the same fields for a single app', async () => {
    const { service, prisma } = buildService();
    prisma.aiAppActiveMember.groupBy.mockResolvedValueOnce([{ appUid: 'app-1', _count: { _all: 2 } }]);

    const result = await service.getApp('app-1');

    expect(result.viewCount).toBe(3);
    expect(result.weeklyActiveUsers).toBe(2);
  });

  it('does not count members whose lastSeenAt is outside the 7-day window', async () => {
    const { service, prisma } = buildService();
    prisma.aiApp.findMany.mockResolvedValueOnce([APP]);
    prisma.aiAppActiveMember.groupBy.mockResolvedValueOnce([]);

    const result = await service.listApps();

    expect(result[0].weeklyActiveUsers).toBe(0);
    const since: Date = prisma.aiAppActiveMember.groupBy.mock.calls[0][0].where.lastSeenAt.gte;
    expect(Date.now() - since.getTime()).toBeGreaterThanOrEqual(AI_APPS_WAU_WINDOW_MS - 1000);
  });
});

describe('AiAppsController POST :uid/views wiring', () => {
  const handler = AiAppsController.prototype.recordView;

  it('registers as POST ":uid/views" with member auth + read permission, 204', () => {
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(':uid/views');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(204);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenCheckGuard, RbacGuard]);
    expect(Reflect.getMetadata(RBAC_PERMISSIONS_KEY, handler)).toEqual({
      anyOf: [AI_APPS_PERMISSIONS.READ, AI_APPS_PERMISSIONS.WRITE],
    });
  });
});

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// The collaborators are passed in as stubs; their real modules pull axios (ESM) that ts-jest cannot load.
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));
jest.mock('./ai-apps.service', () => ({ AiAppsService: jest.fn() }));
jest.mock('./ai-apps-session.service', () => ({ AiAppsSessionService: jest.fn() }));

import { AiAppsTestingUsersService } from './ai-apps-testing-users.service';
import { CreateAiAppTestingUsersSchema } from './dto/testing-users.dto';
import {
  AI_APPS_TESTING_USER_CREATED,
  AI_APPS_TESTING_USER_REVOKED,
  AI_APPS_TESTING_USERS_MAX_PER_APP,
} from './ai-apps.constants';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo', status: 'LIVE' };
const PREVIEW_TARGET = {
  url: 'https://demo-preview.example',
  s3Key: 'apps/demo/preview.zip',
  lastDeployedAt: new Date(0),
};

interface Row {
  uid: string;
  appUid: string;
  number: number;
  name: string;
  createdByUid: string;
  revokedAt: Date | null;
  createdAt: Date;
}

/**
 * In-memory stand-in for the Prisma calls the service makes. `rows` is the
 * AiAppTestingUser table; `member` is never written (asserted below).
 */
function buildService(
  opts: { rows?: Row[]; app?: typeof APP | null; previewTarget?: object | null; admin?: boolean } = {}
) {
  const rows: Row[] = opts.rows ?? [];
  let seq = rows.length;
  const where = (args: any) => (row: Row) =>
    (!args?.where?.appUid || row.appUid === args.where.appUid) &&
    (args?.where?.revokedAt !== null || row.revokedAt === null);
  const table = {
    count: jest.fn(async (args: any) => rows.filter(where(args)).length),
    aggregate: jest.fn(async (args: any) => {
      const numbers = rows.filter(where(args)).map((row) => row.number);
      return { _max: { number: numbers.length ? Math.max(...numbers) : null } };
    }),
    createMany: jest.fn(async ({ data }: { data: Omit<Row, 'uid' | 'createdAt' | 'revokedAt'>[] }) => {
      for (const entry of data) {
        seq += 1;
        rows.push({ ...entry, uid: `tu-${seq}`, revokedAt: null, createdAt: new Date(seq * 1000) });
      }
      return { count: data.length };
    }),
    findMany: jest.fn(async (args: any) => {
      const found = rows
        .filter(where(args))
        .filter((row) => !args.where?.number?.gte || row.number >= args.where.number.gte);
      found.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.number - b.number);
      const skip = args.skip ?? 0;
      return found.slice(skip, args.take ? skip + args.take : undefined);
    }),
    findUnique: jest.fn(async ({ where: w }: any) => rows.find((row) => row.uid === w.uid) ?? null),
    findFirst: jest.fn(
      async ({ where: w }: any) =>
        rows.find((row) => row.uid === w.uid && row.appUid === w.appUid && row.revokedAt === null) ?? null
    ),
    updateMany: jest.fn(async ({ where: w, data }: any) => {
      const hits = rows.filter((row) => row.uid === w.uid && row.revokedAt === null);
      hits.forEach((row) => (row.revokedAt = data.revokedAt));
      return { count: hits.length };
    }),
  };
  const member = { create: jest.fn(), createMany: jest.fn(), update: jest.fn(), upsert: jest.fn() };
  const prisma: any = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(opts.app === undefined ? APP : opts.app) },
    aiAppTarget: {
      findUnique: jest.fn().mockResolvedValue(opts.previewTarget === undefined ? PREVIEW_TARGET : opts.previewTarget),
    },
    aiAppTestingUser: table,
    member,
  };
  prisma.$transaction = jest.fn(async (fn: (tx: unknown) => unknown) => fn(prisma));
  const aiAppsService = {
    isCreatorOrDirectoryAdmin: jest.fn(
      async (requesterUid: string, app: { memberUid: string }) => app.memberUid === requesterUid || !!opts.admin
    ),
  };
  const sessionService = { revokeAllForMember: jest.fn().mockResolvedValue(0) };
  const analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
  const service = new AiAppsTestingUsersService(prisma, aiAppsService as any, sessionService as any, analytics as any);
  return { service, prisma, rows, table, member, aiAppsService, sessionService, analytics };
}

function activeRows(count: number, appUid = 'app-1'): Row[] {
  return Array.from({ length: count }, (_, index) => ({
    uid: `seed-${index + 1}`,
    appUid,
    number: index + 1,
    name: `Testing user ${index + 1}`,
    createdByUid: 'creator-1',
    revokedAt: null,
    createdAt: new Date(index + 1),
  }));
}

describe('AiAppsTestingUsersService', () => {
  describe('create', () => {
    it('creates n testing users named "Testing user n" with uids, listed afterwards', async () => {
      const { service, table } = buildService();
      const created = await service.create('creator-1', 'app-1', 5);
      expect(created.items).toHaveLength(5);
      expect(created.items.map((item) => item.name)).toEqual([
        'Testing user 1',
        'Testing user 2',
        'Testing user 3',
        'Testing user 4',
        'Testing user 5',
      ]);
      created.items.forEach((item) => expect(item.uid).toEqual(expect.any(String)));
      expect(table.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ appUid: 'app-1', createdByUid: 'creator-1', number: 1, name: 'Testing user 1' }),
        ]),
      });

      const listed = await service.list('creator-1', 'app-1');
      expect(listed.total).toBe(5);
      expect(listed.items.map((item) => item.uid)).toEqual(created.items.map((item) => item.uid));
    });

    it('continues numbering after the highest number used, revoked users included', async () => {
      const seeded = activeRows(3);
      seeded[2].revokedAt = new Date(5);
      const { service } = buildService({ rows: seeded });
      const created = await service.create('creator-1', 'app-1', 2);
      expect(created.items.map((item) => item.name)).toEqual(['Testing user 4', 'Testing user 5']);
    });

    it('never writes to the member table', async () => {
      const { service, member } = buildService();
      await service.create('creator-1', 'app-1', 3);
      await service.list('creator-1', 'app-1');
      Object.values(member).forEach((fn) => expect(fn).not.toHaveBeenCalled());
    });

    it('lets a directory admin create for an app they did not create', async () => {
      const { service } = buildService({ admin: true });
      await expect(service.create('admin-1', 'app-1', 1)).resolves.toMatchObject({
        items: [{ name: 'Testing user 1' }],
      });
    });

    it('refuses the 101st active testing user; the first 100 succeed', async () => {
      const { service } = buildService();
      await expect(service.create('creator-1', 'app-1', AI_APPS_TESTING_USERS_MAX_PER_APP)).resolves.toMatchObject({
        items: expect.any(Array),
      });
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(BadRequestException);
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(/100/);
    });

    it('refuses a request past the cap whole, naming the remaining capacity, and creates none', async () => {
      const { service, table, rows } = buildService({ rows: activeRows(98) });
      await expect(service.create('creator-1', 'app-1', 5)).rejects.toThrow(/2 more/);
      expect(table.createMany).not.toHaveBeenCalled();
      expect(rows).toHaveLength(98);
    });

    it('counts only active users toward the cap, so revoking frees capacity', async () => {
      const seeded = activeRows(100);
      seeded[0].revokedAt = new Date(1);
      const { service } = buildService({ rows: seeded });
      await expect(service.create('creator-1', 'app-1', 1)).resolves.toMatchObject({
        items: [{ name: 'Testing user 101' }],
      });
    });

    it.each([0, 101, -1, 1.5, Number.NaN])('refuses n = %p', async (count) => {
      const { service, table } = buildService();
      await expect(service.create('creator-1', 'app-1', count)).rejects.toThrow(BadRequestException);
      expect(table.createMany).not.toHaveBeenCalled();
    });

    it('refuses an app with no Preview environment and creates nothing', async () => {
      const { service, table } = buildService({ previewTarget: null });
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(/Preview/);
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(BadRequestException);
      expect(table.createMany).not.toHaveBeenCalled();
    });

    it('refuses an app whose preview row was never uploaded or deployed', async () => {
      const { service, table } = buildService({ previewTarget: { url: null, s3Key: null, lastDeployedAt: null } });
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(/Preview/);
      expect(table.createMany).not.toHaveBeenCalled();
    });

    it('maps a concurrent create that took the same numbers to 409', async () => {
      const { service, table } = buildService();
      table.createMany.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', 'P2002', '4.4.0')
      );
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow(ConflictException);
    });

    it('fires ai-apps-testing-user-created once per request with app uid, count and acting member', async () => {
      const { service, analytics } = buildService();
      await service.create('creator-1', 'app-1', 4);
      expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: AI_APPS_TESTING_USER_CREATED,
        distinctId: 'creator-1',
        properties: { appUid: 'app-1', count: 4, memberUid: 'creator-1' },
      });
      expect(AI_APPS_TESTING_USER_CREATED).toBe('ai-apps-testing-user-created');
    });

    it('fires no event when the create is refused', async () => {
      const { service, analytics } = buildService({ rows: activeRows(100) });
      await expect(service.create('creator-1', 'app-1', 1)).rejects.toThrow();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });
  });

  describe('list', () => {
    it("shows each user's name, uid, creation and revocation time, revoked ones included, by creation", async () => {
      const seeded = activeRows(3);
      seeded[1].revokedAt = new Date(50);
      const { service } = buildService({ rows: seeded });
      const listed = await service.list('creator-1', 'app-1');
      expect(listed).toEqual({
        page: 1,
        limit: 100,
        total: 3,
        items: [
          { uid: 'seed-1', name: 'Testing user 1', createdAt: new Date(1), revokedAt: null },
          { uid: 'seed-2', name: 'Testing user 2', createdAt: new Date(2), revokedAt: new Date(50) },
          { uid: 'seed-3', name: 'Testing user 3', createdAt: new Date(3), revokedAt: null },
        ],
      });
    });

    it('pages with page + limit', async () => {
      const { service } = buildService({ rows: activeRows(5) });
      const listed = await service.list('creator-1', 'app-1', { page: 2, limit: 2 });
      expect(listed.total).toBe(5);
      expect(listed.items.map((item) => item.uid)).toEqual(['seed-3', 'seed-4']);
    });
  });

  describe('revoke', () => {
    it('marks the user revoked, lists it with a revocation time, and ends its sessions', async () => {
      const { service, sessionService } = buildService({ rows: activeRows(2) });
      const revoked = await service.revoke('creator-1', 'app-1', 'seed-1');
      expect(revoked).toEqual({ uid: 'seed-1', revoked: true, revokedAt: expect.any(Date) });
      expect(sessionService.revokeAllForMember).toHaveBeenCalledWith('seed-1');
      const listed = await service.list('creator-1', 'app-1');
      expect(listed.items[0].revokedAt).toEqual(revoked.revokedAt);
      expect(listed.items[1].revokedAt).toBeNull();
    });

    it('is idempotent: a second revoke succeeds and keeps the first revocation time', async () => {
      const { service, analytics } = buildService({ rows: activeRows(1) });
      const first = await service.revoke('creator-1', 'app-1', 'seed-1');
      const second = await service.revoke('creator-1', 'app-1', 'seed-1');
      expect(second).toEqual({ uid: 'seed-1', revoked: true, revokedAt: first.revokedAt });
      expect(analytics.trackEvent).toHaveBeenCalledTimes(1);
    });

    it('a retry after a failed session step still ends the sessions', async () => {
      const { service, sessionService } = buildService({ rows: activeRows(1) });
      sessionService.revokeAllForMember.mockRejectedValueOnce(new Error('db down'));
      await expect(service.revoke('creator-1', 'app-1', 'seed-1')).rejects.toThrow('db down');
      await expect(service.revoke('creator-1', 'app-1', 'seed-1')).resolves.toMatchObject({ revoked: true });
      expect(sessionService.revokeAllForMember).toHaveBeenCalledTimes(2);
    });

    it('fires ai-apps-testing-user-revoked once per actual revocation with app and testing user uid', async () => {
      const { service, analytics } = buildService({ rows: activeRows(1) });
      await service.revoke('creator-1', 'app-1', 'seed-1');
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: AI_APPS_TESTING_USER_REVOKED,
        distinctId: 'creator-1',
        properties: { appUid: 'app-1', testingUserUid: 'seed-1', memberUid: 'creator-1' },
      });
      expect(AI_APPS_TESTING_USER_REVOKED).toBe('ai-apps-testing-user-revoked');
    });

    it('404s a testing user of another app (or an unknown uid)', async () => {
      const { service } = buildService({ rows: activeRows(1, 'app-2') });
      await expect(service.revoke('creator-1', 'app-1', 'seed-1')).rejects.toThrow(NotFoundException);
      await expect(service.revoke('creator-1', 'app-1', 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('who may manage', () => {
    it('403s a requester who is neither the creator nor a directory admin on create, list and revoke', async () => {
      const { service, table } = buildService({ rows: activeRows(1) });
      await expect(service.create('stranger-1', 'app-1', 1)).rejects.toThrow(ForbiddenException);
      await expect(service.list('stranger-1', 'app-1')).rejects.toThrow(ForbiddenException);
      await expect(service.revoke('stranger-1', 'app-1', 'seed-1')).rejects.toThrow(ForbiddenException);
      expect(table.createMany).not.toHaveBeenCalled();
      expect(table.updateMany).not.toHaveBeenCalled();
    });

    it('404s an unknown or deleted app', async () => {
      await expect(buildService({ app: null }).service.list('creator-1', 'app-1')).rejects.toThrow(NotFoundException);
      await expect(
        buildService({ app: { ...APP, status: 'DELETED' } }).service.create('creator-1', 'app-1', 1)
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findLive', () => {
    it('returns an active testing user of the given app only', async () => {
      const seeded = activeRows(2);
      seeded[1].revokedAt = new Date(9);
      const { service } = buildService({ rows: seeded });
      await expect(service.findLive('seed-1', 'app-1')).resolves.toMatchObject({ uid: 'seed-1' });
      await expect(service.findLive('seed-2', 'app-1')).resolves.toBeNull();
      await expect(service.findLive('seed-1', 'app-2')).resolves.toBeNull();
    });
  });
});

describe('CreateAiAppTestingUsersSchema', () => {
  it('accepts whole numbers from 1 to 100', () => {
    expect(CreateAiAppTestingUsersSchema.parse({ count: 1 })).toEqual({ count: 1 });
    expect(CreateAiAppTestingUsersSchema.parse({ count: 100 })).toEqual({ count: 100 });
  });

  it.each([0, 101, 2.5, '5', undefined])('rejects count = %p', (count) => {
    expect(CreateAiAppTestingUsersSchema.safeParse({ count }).success).toBe(false);
  });
});

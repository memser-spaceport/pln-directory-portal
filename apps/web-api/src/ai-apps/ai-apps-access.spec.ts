/// <reference types="multer" />
import { BadRequestException, ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), post: jest.fn(), get: jest.fn() }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import axios from 'axios';
import { AiAppsService } from './ai-apps.service';
import { AiAppsAccessService } from './ai-apps-access.service';
import { AiAppsController } from './ai-apps.controller';
import { UpdateAiAppAccessSchema, AiAppAccessCandidatesQuerySchema } from './dto/ai-app-access.dto';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const OWNER = 'owner-1';
const VIEWER = 'viewer-1';
const ADMIN = 'admin-1';

const PRIVATE_APP = {
  id: 1,
  uid: 'app-private',
  memberUid: OWNER,
  appId: 'secret-tool',
  name: 'Secret tool',
  status: 'READY',
  access: 'PRIVATE',
  directLinkGateReady: true,
  announcedAt: null as Date | null,
  lastDeployedAt: new Date('2026-09-01T00:00:00.000Z'),
  notes: null,
  failureStream: null,
  database: null,
  viewCount: 0,
  url: 'https://secret-tool.example.test',
  s3Key: 'apps/secret-tool/d1/app.zip',
  deploymentId: 'd1',
  requiredEnvVars: [] as string[],
  providedEnvVars: [] as string[],
  updatedAt: new Date(),
};
const OPEN_APP = {
  ...PRIVATE_APP,
  id: 2,
  uid: 'app-open',
  appId: 'open-tool',
  access: 'OPEN',
  announcedAt: new Date(),
};

type Row = Record<string, any>;

/**
 * Minimal in-memory Prisma double: enough of aiApp / aiAppAllowedMember /
 * member to exercise the access rule end to end.
 */
function buildPrisma(apps: Row[] = [PRIVATE_APP, OPEN_APP], allowed: Row[] = [], admins: string[] = [ADMIN]) {
  const state = { apps: apps.map((app) => ({ ...app })), allowed: allowed.map((row) => ({ ...row })) };
  const matchesWhere = (app: Row, where: Row | undefined): boolean => {
    if (!where) return true;
    return Object.entries(where).every(([key, cond]) => {
      if (key === 'OR') return (cond as Row[]).some((w) => matchesWhere(app, w));
      if (key === 'AND') return (cond as Row[]).every((w) => matchesWhere(app, w));
      if (key === 'NOT') return !matchesWhere(app, cond as Row);
      if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('not' in cond) return app[key] !== cond.not;
        if ('in' in cond) return (cond.in as unknown[]).includes(app[key]);
      }
      return app[key] === cond;
    });
  };
  const prisma: any = {
    state,
    aiApp: {
      findUnique: jest.fn(async ({ where }) => state.apps.find((app) => app.uid === where.uid) ?? null),
      findFirst: jest.fn(async ({ where }) => state.apps.find((app) => matchesWhere(app, where)) ?? null),
      findMany: jest.fn(async ({ where } = {}) => state.apps.filter((app) => matchesWhere(app, where))),
      update: jest.fn(async ({ where, data }) => {
        const app = state.apps.find((row) => row.uid === where.uid)!;
        Object.assign(app, data);
        return { ...app };
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = state.apps.filter((app) => matchesWhere(app, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      upsert: jest.fn(async ({ create }) => {
        const row = { ...PRIVATE_APP, uid: 'app-new', announcedAt: null, lastDeployedAt: null, ...create };
        state.apps.push(row);
        return { ...row };
      }),
    },
    aiAppAllowedMember: {
      findUnique: jest.fn(
        async ({ where }) =>
          state.allowed.find(
            (row) => row.appUid === where.appUid_memberUid.appUid && row.memberUid === where.appUid_memberUid.memberUid
          ) ?? null
      ),
      findMany: jest.fn(async ({ where }) =>
        state.allowed.filter(
          (row) =>
            (where.appUid === undefined || row.appUid === where.appUid) &&
            (where.memberUid === undefined ||
              (typeof where.memberUid === 'string'
                ? row.memberUid === where.memberUid
                : where.memberUid.in.includes(row.memberUid))) &&
            (where.notifiedAt === undefined || (row.notifiedAt ?? null) === where.notifiedAt)
        )
      ),
      updateMany: jest.fn(async ({ where, data }) => {
        const rows = state.allowed.filter(
          (row) =>
            row.appUid === where.appUid &&
            row.memberUid === where.memberUid &&
            (where.notifiedAt === undefined || (row.notifiedAt ?? null) === where.notifiedAt)
        );
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
      deleteMany: jest.fn(async ({ where }) => {
        state.allowed = state.allowed.filter(
          (row) => !(row.appUid === where.appUid && where.memberUid.in.includes(row.memberUid))
        );
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        state.allowed.push(...data.map((row: Row) => ({ ...row, createdAt: new Date() })));
        return { count: data.length };
      }),
    },
    aiAppEvent: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async () => ({})),
    },
    aiAppFeedback: { create: jest.fn(async ({ data }) => ({ uid: 'fb-1', ...data })) },
    aiAppActiveMember: { groupBy: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
    member: {
      findUnique: jest.fn(async ({ where }) =>
        admins.includes(where.uid) ? { memberRoles: [{ name: 'DIRECTORYADMIN' }] } : { memberRoles: [] }
      ),
      findMany: jest.fn(async ({ where }) => {
        const uids: string[] = where?.uid?.in ?? [];
        return uids.map((uid) => ({ uid, name: `Name ${uid}`, image: null }));
      }),
    },
    $executeRaw: jest.fn(async () => 1),
    $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  return prisma;
}

function buildServices(prisma = buildPrisma(), membersWithAccess: string[] = [OWNER, VIEWER, ADMIN, 'friend-1']) {
  const pushNotifications = { create: jest.fn().mockResolvedValue({}) };
  const aws = { uploadFileToS3: jest.fn().mockResolvedValue(undefined) };
  const aiAppsService = new AiAppsService(
    prisma,
    aws as any,
    pushNotifications as any,
    {
      trackEvent: jest.fn(),
    } as any
  );
  const rbacService = { hasPermission: jest.fn(async () => false) };
  const accessControl = {
    hasPermission: jest.fn(async (memberUid: string, code: string) => ({
      memberUid,
      permissionCode: code,
      allowed: membersWithAccess.includes(memberUid) && (code === 'ai_apps.read' || memberUid === OWNER),
    })),
  };
  const accessService = new AiAppsAccessService(prisma, aiAppsService, rbacService as any, accessControl as any);
  return { prisma, aiAppsService, accessService, pushNotifications, accessControl };
}

describe('canViewApp (the visibility rule)', () => {
  const { aiAppsService } = buildServices(
    buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: 'friend-1' }])
  );

  it.each([
    ['an OPEN app, any member', OPEN_APP, VIEWER, true],
    ['an OPEN app, unresolved requester', OPEN_APP, undefined, true],
    ['a PRIVATE app, its owner', PRIVATE_APP, OWNER, true],
    ['a PRIVATE app, a directory admin', PRIVATE_APP, ADMIN, true],
    ['a PRIVATE app, a whitelisted member', PRIVATE_APP, 'friend-1', true],
    ['a PRIVATE app, anyone else', PRIVATE_APP, VIEWER, false],
    ['a PRIVATE app, unresolved requester', PRIVATE_APP, undefined, false],
  ] as const)('%s → %s', async (_label, app, requester, expected) => {
    await expect(aiAppsService.canViewApp(requester, app as any)).resolves.toBe(expected);
  });
});

describe('catalog and feed filtering', () => {
  it('listApps hides private apps from non-allowed members only', async () => {
    const prisma = buildPrisma([PRIVATE_APP, OPEN_APP], [{ appUid: 'app-private', memberUid: 'friend-1' }]);
    const { aiAppsService } = buildServices(prisma);
    const uidsFor = async (requester?: string) => (await aiAppsService.listApps(requester)).map((app) => app.uid);

    expect(await uidsFor(VIEWER)).toEqual(['app-open']);
    expect(await uidsFor(undefined)).toEqual(['app-open']);
    expect(await uidsFor(OWNER)).toEqual(['app-private', 'app-open']);
    expect(await uidsFor('friend-1')).toEqual(['app-private', 'app-open']);
    expect(await uidsFor(ADMIN)).toEqual(['app-private', 'app-open']);
  });

  it('the global event feed excludes hidden apps but keeps app-less events', async () => {
    const { aiAppsService, prisma } = buildServices();
    await aiAppsService.listEvents(undefined, 50, VIEWER);
    expect(prisma.aiAppEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ appUid: null }, { appUid: { notIn: ['app-private'] } }] },
      })
    );
  });

  it('directory admins get the unfiltered event feed', async () => {
    const { aiAppsService, prisma } = buildServices();
    await aiAppsService.listEvents(undefined, 50, ADMIN);
    expect(prisma.aiAppEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: undefined }));
  });
});

describe('per-app reads for a non-allowed member', () => {
  it('getApp 403s on a private app and 404s on an unknown one', async () => {
    const { aiAppsService } = buildServices();
    await expect(aiAppsService.getApp('app-private', VIEWER)).rejects.toThrow(ForbiddenException);
    await expect(aiAppsService.getApp('app-private', undefined)).rejects.toThrow(ForbiddenException);
    await expect(aiAppsService.getApp('missing', VIEWER)).rejects.toThrow(NotFoundException);
  });

  it('checkAppLive 403s without probing the app URL', async () => {
    const { aiAppsService } = buildServices();
    await expect(aiAppsService.checkAppLive('app-private', VIEWER)).rejects.toThrow(ForbiddenException);
    expect(mockedAxios.get).not.toHaveBeenCalled();
    await expect(aiAppsService.checkAppLive('missing', VIEWER)).rejects.toThrow(NotFoundException);
  });

  it('recordView 403s and records nothing', async () => {
    const { aiAppsService, prisma } = buildServices();
    await expect(aiAppsService.recordView(VIEWER, 'app-private')).rejects.toThrow(ForbiddenException);
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.aiAppActiveMember.upsert).not.toHaveBeenCalled();
    await expect(aiAppsService.recordView(VIEWER, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('submitFeedback 403s and stores nothing', async () => {
    const { aiAppsService, prisma } = buildServices();
    await expect(aiAppsService.submitFeedback(VIEWER, 'app-private', 'hi')).rejects.toThrow(ForbiddenException);
    expect(prisma.aiAppFeedback.create).not.toHaveBeenCalled();
    await expect(aiAppsService.submitFeedback(VIEWER, 'missing', 'hi')).rejects.toThrow(NotFoundException);
  });

  it('whitelisted members read the private app normally', async () => {
    const prisma = buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: 'friend-1' }]);
    const { aiAppsService } = buildServices(prisma);
    await expect(aiAppsService.getApp('app-private', 'friend-1')).resolves.toMatchObject({ uid: 'app-private' });
  });

  it('the per-app events and live routes pass the requester to the access check', async () => {
    const aiAppsService = {
      getApp: jest.fn().mockRejectedValue(new ForbiddenException()),
      checkAppLive: jest.fn().mockResolvedValue({ live: true }),
      listEvents: jest.fn(),
    };
    const controller = new AiAppsController(aiAppsService as any, {} as any, {} as any, {} as any, {} as any);
    const req = { memberUid: VIEWER };

    await expect(controller.getAppEvents('app-private', req)).rejects.toThrow(ForbiddenException);
    expect(aiAppsService.getApp).toHaveBeenCalledWith('app-private', VIEWER);
    await expect(controller.listEvents(req, 'app-private')).rejects.toThrow(ForbiddenException);
    expect(aiAppsService.listEvents).not.toHaveBeenCalled();
    await controller.checkAppLive('app-private', req);
    expect(aiAppsService.checkAppLive).toHaveBeenCalledWith('app-private', VIEWER);
  });
});

describe('response shape', () => {
  it('exposes access to everyone, directLinkGateReady to managers only, announcedAt to no one', async () => {
    const { aiAppsService } = buildServices();
    const asViewer = await aiAppsService.getApp('app-open', VIEWER);
    const asOwner = await aiAppsService.getApp('app-open', OWNER);

    expect(asViewer).toMatchObject({ access: 'OPEN' });
    expect(asViewer).not.toHaveProperty('directLinkGateReady');
    expect(asViewer).not.toHaveProperty('announcedAt');
    expect(asOwner).toMatchObject({ access: 'OPEN', directLinkGateReady: true, canManage: true });
    expect(asOwner).not.toHaveProperty('announcedAt');
  });
});

describe('deploys and access', () => {
  const FILE = { buffer: Buffer.from('zip'), mimetype: 'application/zip' } as Express.Multer.File;
  const DTO = { appId: 'brand-new', name: 'Brand new', deploymentId: 'd1' } as any;

  it('the first agent deploy and draft registration create PRIVATE apps; update never touches access', async () => {
    const { aiAppsService, prisma } = buildServices(buildPrisma([]));
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await aiAppsService.deploy(OWNER, DTO, FILE);
    await aiAppsService.registerDraft(OWNER, { ...DTO, appId: 'drafty', requiredEnvVars: ['API_KEY'] }, FILE);

    for (const [call] of prisma.aiApp.upsert.mock.calls) {
      expect(call.create.access).toBe('PRIVATE');
      expect(call.update).not.toHaveProperty('access');
    }
  });

  it('a successful deploy marks the direct link as gated and keeps an OPEN app OPEN', async () => {
    const legacy = { ...OPEN_APP, directLinkGateReady: false };
    const { aiAppsService, prisma } = buildServices(buildPrisma([legacy]));
    mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } });

    await aiAppsService.deployDraft(OWNER, 'app-open', undefined);

    expect(prisma.state.apps[0]).toMatchObject({ access: 'OPEN', directLinkGateReady: true, status: 'READY' });
  });
});

describe('announcement', () => {
  beforeEach(() => mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } }));

  it('a private app first deploy sends no broadcast', async () => {
    const draft = { ...PRIVATE_APP, status: 'DRAFT', lastDeployedAt: null };
    const { aiAppsService, pushNotifications } = buildServices(buildPrisma([draft]));
    await aiAppsService.deployDraft(OWNER, 'app-private', undefined);
    expect(pushNotifications.create).not.toHaveBeenCalled();
  });

  it('switching a deployed, never-announced app to OPEN broadcasts once; later toggles stay silent', async () => {
    const { accessService, pushNotifications, prisma } = buildServices();

    await accessService.updateAccess(OWNER, 'app-private', { access: 'OPEN', memberUids: [] });
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: [] });
    await accessService.updateAccess(OWNER, 'app-private', { access: 'OPEN', memberUids: [] });

    expect(pushNotifications.create).toHaveBeenCalledTimes(1);
    expect(pushNotifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ link: '/pl-infra/ai-apps/app-private', requiredPermissions: expect.any(Array) })
    );
    expect(prisma.state.apps[0].announcedAt).toBeInstanceOf(Date);
  });

  it('opening an app that never shipped waits for its first deploy', async () => {
    const draft = { ...PRIVATE_APP, status: 'DRAFT', lastDeployedAt: null };
    const { accessService, aiAppsService, pushNotifications } = buildServices(buildPrisma([draft]));

    await accessService.updateAccess(OWNER, 'app-private', { access: 'OPEN', memberUids: [] });
    expect(pushNotifications.create).not.toHaveBeenCalled();

    await aiAppsService.deployDraft(OWNER, 'app-private', undefined);
    expect(pushNotifications.create).toHaveBeenCalledTimes(1);
  });

  it('an app announced before this release is never re-announced', async () => {
    const legacy = { ...PRIVATE_APP, announcedAt: new Date('2026-08-01T00:00:00.000Z') };
    const { accessService, pushNotifications } = buildServices(buildPrisma([legacy]));
    await accessService.updateAccess(OWNER, 'app-private', { access: 'OPEN', memberUids: [] });
    expect(pushNotifications.create).not.toHaveBeenCalled();
  });
});

describe('"shared with you" notifications', () => {
  beforeEach(() => mockedAxios.post.mockResolvedValue({ status: 200, data: { port: 31001 } }));

  const accessGrants = (pushNotifications: { create: jest.Mock }) =>
    pushNotifications.create.mock.calls.map(([dto]) => dto).filter((dto) => dto.metadata?.trigger === 'access_granted');

  it('notifies only the newly added member of a deployed private app', async () => {
    const prisma = buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: VIEWER, notifiedAt: new Date() }]);
    prisma.member.findUnique.mockImplementation(async ({ where }: Row) =>
      where.uid === OWNER ? { name: 'Olivia', memberRoles: [] } : { memberRoles: [] }
    );
    const { accessService, pushNotifications } = buildServices(prisma);

    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: [VIEWER, 'friend-1'] });

    const grants = accessGrants(pushNotifications);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      recipientUid: 'friend-1',
      isPublic: false,
      link: '/pl-infra/ai-apps/app-private',
      title: 'Secret tool was shared with you',
      description: 'Olivia gave you access to this private AI App.',
    });
    expect(grants[0]).not.toHaveProperty('requiredPermissions');
  });

  it('saving again does not re-notify anyone', async () => {
    const { accessService, pushNotifications } = buildServices();
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: ['friend-1'] });
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: ['friend-1'] });
    expect(accessGrants(pushNotifications)).toHaveLength(1);
  });

  it('a draft notifies its members on the first successful deploy, not before', async () => {
    const draft = { ...PRIVATE_APP, status: 'DRAFT', lastDeployedAt: null };
    const { accessService, aiAppsService, pushNotifications } = buildServices(buildPrisma([draft]));

    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: ['friend-1'] });
    expect(accessGrants(pushNotifications)).toHaveLength(0);

    await aiAppsService.deployDraft(OWNER, 'app-private', undefined);
    expect(accessGrants(pushNotifications).map((dto) => dto.recipientUid)).toEqual(['friend-1']);

    await aiAppsService.deployDraft(OWNER, 'app-private', undefined);
    expect(accessGrants(pushNotifications)).toHaveLength(1);
  });

  it('members saved while OPEN are never pinged, even after a switch to PRIVATE', async () => {
    const { accessService, pushNotifications } = buildServices();
    await accessService.updateAccess(OWNER, 'app-open', { access: 'OPEN', memberUids: ['friend-1'] });
    await accessService.updateAccess(OWNER, 'app-open', { access: 'PRIVATE', memberUids: ['friend-1'] });
    expect(accessGrants(pushNotifications)).toHaveLength(0);
  });

  it('a removed and re-added member is notified again', async () => {
    const { accessService, pushNotifications } = buildServices();
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: ['friend-1'] });
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: [] });
    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: ['friend-1'] });
    expect(accessGrants(pushNotifications)).toHaveLength(2);
  });
});

describe('managing access', () => {
  it('the owner makes the app private with two members, who can then view it', async () => {
    const { accessService, aiAppsService } = buildServices();
    const saved = await accessService.updateAccess(OWNER, 'app-open', {
      access: 'PRIVATE',
      memberUids: [VIEWER, 'friend-1', VIEWER, OWNER],
    });

    expect(saved.access).toBe('PRIVATE');
    expect(saved.members.map((member) => member.uid).sort()).toEqual(['friend-1', VIEWER]);
    await expect(aiAppsService.getApp('app-open', VIEWER)).resolves.toMatchObject({ access: 'PRIVATE' });
  });

  it('removing a member revokes their access', async () => {
    const prisma = buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: VIEWER }]);
    const { accessService, aiAppsService } = buildServices(prisma);

    await accessService.updateAccess(OWNER, 'app-private', { access: 'PRIVATE', memberUids: [] });

    await expect(aiAppsService.getApp('app-private', VIEWER)).rejects.toThrow(ForbiddenException);
  });

  it('the whitelist survives a round trip through OPEN', async () => {
    const prisma = buildPrisma(
      [PRIVATE_APP],
      [
        { appUid: 'app-private', memberUid: VIEWER, createdAt: new Date() },
        { appUid: 'app-private', memberUid: 'friend-1', createdAt: new Date() },
      ]
    );
    const { accessService } = buildServices(prisma);

    await accessService.updateAccess(OWNER, 'app-private', { access: 'OPEN', memberUids: [VIEWER, 'friend-1'] });
    const restored = await accessService.updateAccess(OWNER, 'app-private', {
      access: 'PRIVATE',
      memberUids: [VIEWER, 'friend-1'],
    });

    expect(restored.members.map((member) => member.uid).sort()).toEqual(['friend-1', VIEWER]);
    expect(prisma.aiAppAllowedMember.createMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: [] }));
  });

  it('a directory admin may manage anyone’s app; other members get 403 and nothing changes', async () => {
    const { accessService, prisma } = buildServices();
    await expect(accessService.getAccess(ADMIN, 'app-private')).resolves.toMatchObject({ access: 'PRIVATE' });
    await expect(accessService.updateAccess(VIEWER, 'app-private', { access: 'OPEN', memberUids: [] })).rejects.toThrow(
      ForbiddenException
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    await expect(accessService.getAccess(VIEWER, 'missing')).rejects.toThrow(NotFoundException);
  });

  it('rejects the whole save when a uid is unknown or lacks AI Apps access', async () => {
    const prisma = buildPrisma();
    prisma.member.findMany.mockImplementation(async ({ where }: Row) =>
      (where.uid.in as string[]).filter((uid) => uid !== 'ghost').map((uid) => ({ uid }))
    );
    const { accessService } = buildServices(prisma);

    const attempt = accessService.updateAccess(OWNER, 'app-private', {
      access: 'PRIVATE',
      memberUids: [VIEWER, 'ghost', 'outsider'],
    });

    await expect(attempt).rejects.toThrow(BadRequestException);
    await attempt.catch((error: BadRequestException) =>
      expect(error.getResponse()).toMatchObject({
        unknownMemberUids: ['ghost'],
        membersWithoutAiAppsAccess: ['outsider'],
      })
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('member search flags AI Apps access and existing whitelist membership', async () => {
    const prisma = buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: VIEWER }]);
    prisma.member.findMany.mockImplementationOnce(async () => [
      { uid: VIEWER, name: 'Alice', image: { url: 'https://img/a.png' }, teamMemberRoles: [{ team: { name: 'PL' } }] },
      { uid: 'outsider', name: 'Alina', image: null, teamMemberRoles: [] },
    ]);
    const { accessService } = buildServices(prisma);

    const results = await accessService.searchCandidates(OWNER, 'app-private', 'ali');

    expect(results).toEqual([
      {
        uid: VIEWER,
        name: 'Alice',
        image: 'https://img/a.png',
        teamName: 'PL',
        hasAiAppsAccess: true,
        alreadyAdded: true,
      },
      { uid: 'outsider', name: 'Alina', image: null, teamName: null, hasAiAppsAccess: false, alreadyAdded: false },
    ]);
    expect(prisma.member.findMany.mock.calls[0][0].where).toMatchObject({
      name: { contains: 'ali', mode: 'insensitive' },
      deletedAt: null,
      uid: { not: OWNER },
    });
  });

  it('validates the request bodies', () => {
    expect(UpdateAiAppAccessSchema.safeParse({ access: 'SECRET', memberUids: [] }).success).toBe(false);
    expect(
      UpdateAiAppAccessSchema.safeParse({
        access: 'PRIVATE',
        memberUids: Array.from({ length: 201 }, (_, i) => `m${i}`),
      }).success
    ).toBe(false);
    expect(UpdateAiAppAccessSchema.parse({ access: 'OPEN' })).toEqual({ access: 'OPEN', memberUids: [] });
    expect(AiAppAccessCandidatesQuerySchema.safeParse({ search: '   ' }).success).toBe(false);
  });
});

describe('sidecar access check', () => {
  it('allows OPEN apps and whitelisted members, 403s others with a reason', async () => {
    const prisma = buildPrisma([PRIVATE_APP, OPEN_APP], [{ appUid: 'app-private', memberUid: 'friend-1' }]);
    const { accessService } = buildServices(prisma);

    await expect(accessService.checkAccess(VIEWER, 'open-tool', 'GET')).resolves.toEqual({ allowed: true });
    await expect(accessService.checkAccess('friend-1', 'secret-tool', 'GET')).resolves.toEqual({ allowed: true });
    await expect(accessService.checkAccess(OWNER, 'secret-tool', 'GET')).resolves.toEqual({ allowed: true });

    const denied = accessService.checkAccess(VIEWER, 'secret-tool', 'GET');
    await expect(denied).rejects.toThrow(ForbiddenException);
    await denied.catch((error: ForbiddenException) =>
      expect(error.getResponse()).toMatchObject({ allowed: false, reason: 'private' })
    );
  });

  it('requires the PL Infra permission first — whitelisted members without it are denied', async () => {
    const prisma = buildPrisma([PRIVATE_APP], [{ appUid: 'app-private', memberUid: 'outsider' }]);
    const { accessService } = buildServices(prisma);
    const denied = accessService.checkAccess('outsider', 'secret-tool', 'GET');
    await expect(denied).rejects.toThrow(ForbiddenException);
    await denied.catch((error: ForbiddenException) =>
      expect(error.getResponse()).toMatchObject({ reason: 'permission' })
    );
  });

  it('non-GET methods need write access', async () => {
    const { accessService } = buildServices();
    await expect(accessService.checkAccess(VIEWER, 'open-tool', 'POST')).rejects.toThrow(ForbiddenException);
    await expect(accessService.checkAccess(OWNER, 'open-tool', 'POST')).resolves.toEqual({ allowed: true });
  });

  it('an appId the Directory does not track keeps the permission-only behavior', async () => {
    const { accessService } = buildServices();
    await expect(accessService.checkAccess(VIEWER, 'not-ours', 'GET')).resolves.toEqual({
      allowed: true,
      reason: 'untracked',
    });
  });

  it('deleted apps are ignored when resolving the appId', async () => {
    const { accessService, prisma } = buildServices();
    await accessService.checkAccess(VIEWER, 'secret-tool', 'GET').catch(() => undefined);
    expect(prisma.aiApp.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { appId: 'secret-tool', status: { not: 'DELETED' } } })
    );
  });
});

describe('access routes', () => {
  const proto = AiAppsController.prototype as any;
  const route = (name: string) => ({
    path: Reflect.getMetadata(PATH_METADATA, proto[name]),
    method: Reflect.getMetadata(METHOD_METADATA, proto[name]),
    guards: Reflect.getMetadata(GUARDS_METADATA, proto[name]) ?? [],
  });

  it('declares the management and sidecar routes', () => {
    expect(route('getAccess')).toMatchObject({ path: ':uid/access', method: RequestMethod.GET });
    expect(route('updateAccess')).toMatchObject({ path: ':uid/access', method: RequestMethod.PUT });
    expect(route('searchAccessCandidates')).toMatchObject({
      path: ':uid/access/candidates',
      method: RequestMethod.GET,
    });
    expect(route('checkAccess')).toMatchObject({ path: 'access-check', method: RequestMethod.GET });
    expect(route('checkAccess').guards).toEqual([UserAccessTokenValidateGuard]);
  });

  it('declares access-check before the :uid route so the literal path wins', () => {
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('checkAccess')).toBeGreaterThan(-1);
    expect(names.indexOf('checkAccess')).toBeLessThan(names.indexOf('getApp'));
  });
});

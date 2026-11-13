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
import { AiAppsAccessService } from './ai-apps-access.service';
import { AiAppsAudienceService } from './ai-apps-audience.service';
import { AiAppAudienceController } from './ai-app-audience.controller';
import { AiAppsController } from './ai-apps.controller';
import { UpdateAiAppAudienceSchema } from './dto/ai-app-audience.dto';
import { AiAppMeRbacGuard } from './guards/ai-app-me-rbac.guard';
import { AiAppReadOrAudienceGuard } from './guards/ai-app-read-or-audience.guard';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';

const OWNER = 'owner-1';
const INFRA = 'infra-1'; // holds ai_apps.read
const FOUNDER = 'founder-1'; // approved, holds founder_plc_crypto, no AI Apps access
const PENDING = 'pending-1'; // holds founder_plc_crypto but is not approved
const INVESTOR = 'investor-1'; // approved, holds investor_pl only

type Row = Record<string, any>;

const PUBLISHED_APP = {
  uid: 'app-published',
  memberUid: OWNER,
  appId: 'playbook',
  name: 'Playbook',
  description: 'Shared prompts',
  status: 'READY',
  access: 'PRIVATE',
  previewAccess: 'PRIVATE',
  publicPaths: [] as string[],
  audiencePolicyCodes: ['founder_plc_crypto'],
  directLinkGateReady: true,
  lastDeployedAt: new Date(0),
  url: 'https://playbook.example.test',
};
const INTERNAL_APP = {
  ...PUBLISHED_APP,
  uid: 'app-internal',
  appId: 'internal-tool',
  name: 'Internal tool',
  access: 'OPEN',
  audiencePolicyCodes: [] as string[],
  url: null as string | null,
};

function buildPrisma(apps: Row[] = [PUBLISHED_APP, INTERNAL_APP]) {
  const state = { apps: apps.map((app) => ({ ...app })) };
  const assignments = [
    { uid: 'pa-1', memberUid: FOUNDER, code: 'founder_plc_crypto', state: 'APPROVED' },
    { uid: 'pa-2', memberUid: PENDING, code: 'founder_plc_crypto', state: 'PENDING' },
    { uid: 'pa-3', memberUid: INVESTOR, code: 'investor_pl', state: 'APPROVED' },
  ];
  const held = (where: Row) =>
    assignments.filter(
      (row) =>
        row.memberUid === where.memberUid &&
        (!where.policy?.code?.in || where.policy.code.in.includes(row.code)) &&
        (!where.member?.memberApproval?.state || row.state === where.member.memberApproval.state)
    );
  const matches = (app: Row, where: Row = {}) =>
    (where.appId === undefined || app.appId === where.appId) &&
    (where.status?.not === undefined || app.status !== where.status.not) &&
    (where.status?.notIn === undefined || !where.status.notIn.includes(app.status)) &&
    (where.lastDeployedAt === undefined || app.lastDeployedAt !== null) &&
    (where.audiencePolicyCodes?.isEmpty !== false || app.audiencePolicyCodes.length > 0) &&
    (where.audiencePolicyCodes?.hasSome === undefined ||
      app.audiencePolicyCodes.some((code: string) => where.audiencePolicyCodes.hasSome.includes(code)));
  const prisma: any = {
    state,
    aiApp: {
      findFirst: jest.fn(async ({ where }) => state.apps.find((app) => matches(app, where)) ?? null),
      findMany: jest.fn(async ({ where }) => state.apps.filter((app) => matches(app, where))),
      update: jest.fn(async ({ where, data }) => {
        const app = state.apps.find((row) => row.uid === where.uid)!;
        Object.assign(app, data);
        return { ...app };
      }),
    },
    aiAppAllowedMember: { findUnique: jest.fn(async () => null) },
    aiAppEvent: { create: jest.fn(async () => ({})) },
    policyAssignment: {
      findFirst: jest.fn(async ({ where }) => held(where)[0] ?? null),
      findMany: jest.fn(async ({ where }) => held(where).map((row) => ({ policy: { code: row.code } }))),
    },
    policy: {
      findMany: jest.fn(async ({ where }) =>
        ['founder_plc_crypto', 'investor_pl', 'unassigned_plc_other']
          .filter((code) => where.code.in.includes(code))
          .map((code) => ({ code }))
      ),
    },
  };
  return prisma;
}

function buildServices(prisma = buildPrisma()) {
  const aiAppsService: any = {
    canViewApp: jest.fn(async (requesterUid: string, app: Row) => app.access === 'OPEN' || requesterUid === OWNER),
    canViewPreview: jest.fn(async (requesterUid: string) => requesterUid === OWNER),
  };
  const audienceService = new AiAppsAudienceService(prisma);
  const rbacService = { hasPermission: jest.fn(async () => false) };
  const accessControl = {
    hasPermission: jest.fn(async (memberUid: string, code: string) => ({
      memberUid,
      permissionCode: code,
      allowed: (memberUid === INFRA && code === 'ai_apps.read') || memberUid === OWNER,
    })),
  };
  const accessService = new AiAppsAccessService(
    prisma,
    aiAppsService,
    rbacService as any,
    accessControl as any,
    undefined,
    audienceService
  );
  return { prisma, audienceService, accessService };
}

const reason = async (denied: Promise<unknown>) =>
  denied.then(
    () => 'allowed',
    (error: ForbiddenException) => (error.getResponse() as Row).reason
  );

describe('isInAudience', () => {
  it('an unpublished app has no audience, and no lookup is made', async () => {
    const { audienceService, prisma } = buildServices();
    await expect(audienceService.isInAudience(FOUNDER, INTERNAL_APP)).resolves.toBe(false);
    await expect(audienceService.isInAudience(undefined, PUBLISHED_APP)).resolves.toBe(false);
    await expect(audienceService.isInAudience(FOUNDER, null)).resolves.toBe(false);
    expect(prisma.policyAssignment.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['an approved member holding one of the policies', FOUNDER, true],
    ['an approved member holding other policies', INVESTOR, false],
    ['a member holding the policy who is not approved', PENDING, false],
    ['a member with no policies', 'nobody', false],
  ])('%s → %s', async (_label, memberUid, expected) => {
    const { audienceService } = buildServices();
    await expect(audienceService.isInAudience(memberUid, PUBLISHED_APP)).resolves.toBe(expected);
  });

  it('resolves the app by appId, skipping unpublished and unknown apps', async () => {
    const { audienceService } = buildServices();
    await expect(audienceService.isInAudienceOfAppId(FOUNDER, 'playbook')).resolves.toBe(true);
    await expect(audienceService.isInAudienceOfAppId(FOUNDER, 'internal-tool')).resolves.toBe(false);
    await expect(audienceService.isInAudienceOfAppId(FOUNDER, 'not-ours')).resolves.toBe(false);
    await expect(audienceService.isInAudienceOfAppId(FOUNDER, undefined)).resolves.toBe(false);
  });
});

describe('sidecar access check for a published app', () => {
  it('lets an audience member use the app with every method, without the PL Infra permission', async () => {
    const { accessService } = buildServices();
    await expect(accessService.checkAccess(FOUNDER, 'playbook', 'GET')).resolves.toEqual({
      allowed: true,
      reason: 'audience',
    });
    await expect(accessService.checkAccess(FOUNDER, 'playbook', 'POST')).resolves.toEqual({
      allowed: true,
      reason: 'audience',
    });
  });

  it('gives an audience member no other app, no preview, and nothing untracked', async () => {
    const { accessService } = buildServices();
    await expect(reason(accessService.checkAccess(FOUNDER, 'internal-tool', 'GET'))).resolves.toBe('permission');
    await expect(reason(accessService.checkAccess(FOUNDER, 'playbook', 'GET', undefined, 'preview'))).resolves.toBe(
      'permission'
    );
    await expect(reason(accessService.checkAccess(FOUNDER, 'not-ours', 'GET'))).resolves.toBe('permission');
  });

  it('refuses members outside the audience as before', async () => {
    const { accessService } = buildServices();
    await expect(reason(accessService.checkAccess(INVESTOR, 'playbook', 'GET'))).resolves.toBe('permission');
    await expect(reason(accessService.checkAccess(PENDING, 'playbook', 'GET'))).resolves.toBe('permission');
    // PL Infra member, PRIVATE app, not whitelisted and not in the audience.
    await expect(reason(accessService.checkAccess(INFRA, 'playbook', 'GET'))).resolves.toBe('private');
  });

  it('clearing the audience blocks the next request', async () => {
    const { accessService, audienceService } = buildServices();
    await audienceService.updateAudience('admin-1', 'playbook', []);
    await expect(reason(accessService.checkAccess(FOUNDER, 'playbook', 'GET'))).resolves.toBe('permission');
  });

  it('leaves PL Infra members and untracked apps unchanged', async () => {
    const { accessService } = buildServices();
    await expect(accessService.checkAccess(INFRA, 'internal-tool', 'GET')).resolves.toEqual({ allowed: true });
    await expect(reason(accessService.checkAccess(INFRA, 'internal-tool', 'POST'))).resolves.toBe('permission');
    await expect(accessService.checkAccess(INFRA, 'not-ours', 'GET')).resolves.toEqual({
      allowed: true,
      reason: 'untracked',
    });
  });
});

describe('published apps for a member', () => {
  it('lists only live apps published to a policy the member holds', async () => {
    const { accessService } = buildServices();
    await expect(accessService.listPublishedApps(FOUNDER)).resolves.toEqual([
      {
        uid: 'app-published',
        appId: 'playbook',
        name: 'Playbook',
        description: 'Shared prompts',
        url: 'https://playbook.example.test',
      },
    ]);
    await expect(accessService.listPublishedApps(INVESTOR)).resolves.toEqual([]);
    await expect(accessService.listPublishedApps(PENDING)).resolves.toEqual([]);
  });

  it('skips the app query for a member without policies', async () => {
    const { accessService, prisma } = buildServices();
    await expect(accessService.listPublishedApps('nobody')).resolves.toEqual([]);
    expect(prisma.aiApp.findMany).not.toHaveBeenCalled();
  });

  it('leaves out apps that never deployed or are being deleted', async () => {
    const { accessService } = buildServices(
      buildPrisma([
        { ...PUBLISHED_APP, uid: 'a', appId: 'never-shipped', lastDeployedAt: null },
        { ...PUBLISHED_APP, uid: 'b', appId: 'going-away', status: 'DELETING' },
      ])
    );
    await expect(accessService.listPublishedApps(FOUNDER)).resolves.toEqual([]);
  });
});

describe('managing the audience', () => {
  it('returns the current audience and 404s an unknown app', async () => {
    const { audienceService } = buildServices();
    await expect(audienceService.getAudience('playbook')).resolves.toEqual({
      appUid: 'app-published',
      appId: 'playbook',
      name: 'Playbook',
      policyCodes: ['founder_plc_crypto'],
      directLinkGateReady: true,
    });
    await expect(audienceService.getAudience('not-ours')).rejects.toThrow(NotFoundException);
  });

  it('saves a deduplicated, sorted list and audits the change', async () => {
    const { audienceService, prisma } = buildServices();
    const saved = await audienceService.updateAudience('admin-1', 'internal-tool', [
      'investor_pl',
      'founder_plc_crypto',
      'investor_pl',
    ]);
    expect(saved.policyCodes).toEqual(['founder_plc_crypto', 'investor_pl']);
    expect(prisma.aiApp.update).toHaveBeenCalledWith({
      where: { uid: 'app-internal' },
      data: { audiencePolicyCodes: ['founder_plc_crypto', 'investor_pl'] },
    });
    expect(prisma.aiAppEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'AUDIENCE_UPDATED',
        memberUid: 'admin-1',
        appUid: 'app-internal',
        appId: 'internal-tool',
        message: 'Audience policies: ["founder_plc_crypto","investor_pl"]',
      },
    });
  });

  it('rejects unknown policy codes and saves nothing', async () => {
    const { audienceService, prisma } = buildServices();
    const rejected = audienceService.updateAudience('admin-1', 'playbook', ['investor_pl', 'no_such_policy']);
    await expect(rejected).rejects.toThrow(BadRequestException);
    await rejected.catch((error: BadRequestException) =>
      expect(error.getResponse()).toMatchObject({ unknownPolicyCodes: ['no_such_policy'] })
    );
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('saving the stored list again is a no-op', async () => {
    const { audienceService, prisma } = buildServices();
    await audienceService.updateAudience('admin-1', 'playbook', ['founder_plc_crypto']);
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
    expect(prisma.aiAppEvent.create).not.toHaveBeenCalled();
  });

  it('an empty list takes the app back', async () => {
    const { audienceService, prisma } = buildServices();
    await expect(audienceService.updateAudience('admin-1', 'playbook', [])).resolves.toMatchObject({
      policyCodes: [],
    });
    expect(prisma.aiAppEvent.create).toHaveBeenCalledTimes(1);
  });

  it('validates the request body', () => {
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: ['investor_pl'] }).success).toBe(true);
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: [] }).success).toBe(true);
    expect(UpdateAiAppAudienceSchema.safeParse({}).success).toBe(false);
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: [''] }).success).toBe(false);
  });
});

const context = (req: any) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any);

describe('AiAppReadOrAudienceGuard (app sign-in)', () => {
  const build = (hasPermission: boolean) => {
    const reflector = { getAllAndOverride: jest.fn(() => ({ anyOf: ['ai_apps.read', 'ai_apps.write'] })) };
    const rbacService = {
      findMemberByUid: jest.fn(async (uid: string) => ({ uid })),
      findMemberByEmail: jest.fn(async () => ({ uid: FOUNDER })),
      hasPermission: jest.fn(async () => hasPermission),
    };
    const accessControl = { hasPermission: jest.fn(async () => ({ allowed: false })) };
    const audienceService = {
      isInAudienceOfAppId: jest.fn(
        async (memberUid: string, appId: string) => memberUid === FOUNDER && appId === 'playbook'
      ),
    };
    const guard = new AiAppReadOrAudienceGuard(
      reflector as any,
      rbacService as any,
      accessControl as any,
      audienceService as any
    );
    return { guard, audienceService };
  };

  it('passes a member with the permission without looking at the audience', async () => {
    const { guard, audienceService } = build(true);
    await expect(guard.canActivate(context({ memberUid: INFRA, body: { appId: 'playbook' } }))).resolves.toBe(true);
    expect(audienceService.isInAudienceOfAppId).not.toHaveBeenCalled();
  });

  it('passes an audience member for the production target of the published app', async () => {
    const { guard } = build(false);
    await expect(guard.canActivate(context({ memberUid: FOUNDER, body: { appId: 'playbook' } }))).resolves.toBe(true);
    await expect(
      guard.canActivate(context({ userEmail: 'founder@example.test', body: { appId: 'playbook', target: 'prod' } }))
    ).resolves.toBe(true);
  });

  it.each([
    ['another app', { memberUid: FOUNDER, body: { appId: 'internal-tool' } }],
    ['the preview target', { memberUid: FOUNDER, body: { appId: 'playbook', target: 'preview' } }],
    ['the old name of the preview target', { memberUid: FOUNDER, body: { appId: 'playbook', target: 'dev' } }],
    ['a body without appId', { memberUid: FOUNDER, body: {} }],
    ['a member outside the audience', { memberUid: INVESTOR, body: { appId: 'playbook' } }],
  ])('refuses %s', async (_label, req) => {
    const { guard } = build(false);
    await expect(guard.canActivate(context(req))).rejects.toThrow(ForbiddenException);
  });
});

describe('AiAppMeRbacGuard (member context)', () => {
  const build = () => {
    const reflector = { getAllAndOverride: jest.fn(() => ({ anyOf: ['ai_apps.read', 'ai_apps.write'] })) };
    const rbacService = {
      findMemberByUid: jest.fn(async (uid: string) => ({ uid })),
      hasPermission: jest.fn(async () => false),
    };
    const accessControl = { hasPermission: jest.fn(async () => ({ allowed: false })) };
    const audienceService = {
      isInAudienceOfAppId: jest.fn(
        async (memberUid: string, appId: string) => memberUid === FOUNDER && appId === 'playbook'
      ),
    };
    return new AiAppMeRbacGuard(reflector as any, rbacService as any, accessControl as any, audienceService as any);
  };

  it('passes an audience member whose app session is for the published app', async () => {
    await expect(build().canActivate(context({ memberUid: FOUNDER, aiAppSessionAppId: 'playbook' }))).resolves.toBe(
      true
    );
  });

  it.each([
    ['a session for another app', { memberUid: FOUNDER, aiAppSessionAppId: 'internal-tool' }],
    ['a LabOS token (no app session)', { memberUid: FOUNDER }],
    ['a member outside the audience', { memberUid: INVESTOR, aiAppSessionAppId: 'playbook' }],
  ])('refuses %s', async (_label, req) => {
    await expect(build().canActivate(context(req))).rejects.toThrow(ForbiddenException);
  });
});

describe('audience routes', () => {
  const route = (proto: any, name: string) => ({
    path: Reflect.getMetadata(PATH_METADATA, proto[name]),
    method: Reflect.getMetadata(METHOD_METADATA, proto[name]),
    guards: Reflect.getMetadata(GUARDS_METADATA, proto[name]),
  });

  it('lists published apps for any signed-in member, before the :uid route', () => {
    const proto = AiAppsController.prototype as any;
    expect(route(proto, 'listPublishedApps')).toEqual({
      path: 'published',
      method: RequestMethod.GET,
      guards: [UserTokenCheckGuard],
    });
    const names = Object.getOwnPropertyNames(proto);
    expect(names.indexOf('listPublishedApps')).toBeLessThan(names.indexOf('getApp'));
  });

  it('keeps audience management to directory admins', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AiAppAudienceController)).toBe('v1/admin/ai-app-audience');
    expect(Reflect.getMetadata(GUARDS_METADATA, AiAppAudienceController)).toEqual([AdminAuthGuard]);
    const proto = AiAppAudienceController.prototype as any;
    expect(route(proto, 'get')).toMatchObject({ path: ':appId', method: RequestMethod.GET });
    expect(route(proto, 'update')).toMatchObject({ path: ':appId', method: RequestMethod.PUT });
  });

  it('records the admin as the actor of an audience change', async () => {
    const audienceService = { updateAudience: jest.fn(async () => ({})) };
    const controller = new AiAppAudienceController(audienceService as any);
    await controller.update('playbook', { policyCodes: ['investor_pl'] } as any, { user: { memberUid: 'admin-1' } });
    expect(audienceService.updateAudience).toHaveBeenCalledWith('admin-1', 'playbook', ['investor_pl']);
  });
});

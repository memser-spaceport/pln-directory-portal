import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
} from '@nestjs/common';
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
import { AiAppsAudienceService, normalizePath } from './ai-apps-audience.service';
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
const PENDING = 'pending-1'; // holds founder_plc_crypto and plaa.member but is not approved
const INVESTOR = 'investor-1'; // approved, holds investor_pl only
const PLA = 'pla-1'; // approved, no policy in any audience, holds the plaa.member permission
const PICKED = 'picked-1'; // approved, no policy or permission, added to an app by name

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
  audiencePermissionCodes: [] as string[],
  showInMore: true,
  path: null as string | null,
  iconUrl: null as string | null,
  hideTopNav: false,
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
const PLA_APP = {
  ...PUBLISHED_APP,
  uid: 'app-pla',
  appId: 'pla-portal',
  name: 'PLA portal',
  audiencePolicyCodes: [] as string[],
  audiencePermissionCodes: ['plaa.member'],
  showInMore: false,
  path: 'pla',
  iconUrl: 'https://cdn.example.test/pla.png',
  hideTopNav: true,
  url: 'https://pla.example.test',
};

const APPROVAL: Record<string, string> = {
  [OWNER]: 'APPROVED',
  [INFRA]: 'APPROVED',
  [FOUNDER]: 'APPROVED',
  [PENDING]: 'PENDING',
  [INVESTOR]: 'APPROVED',
  [PLA]: 'APPROVED',
  [PICKED]: 'APPROVED',
};
const EFFECTIVE_PERMISSIONS: Record<string, string[]> = {
  [PLA]: ['plaa.member'],
  [PENDING]: ['plaa.member'],
  [INFRA]: ['ai_apps.read'],
};
const MEMBERS: Row[] = [
  { uid: PICKED, name: 'Picked Founder', email: 'picked@example.test' },
  { uid: PLA, name: 'Pla Participant', email: null },
  { uid: FOUNDER, name: 'Founder', email: 'founder@example.test' },
];

function buildPrisma(apps: Row[] = [PUBLISHED_APP, INTERNAL_APP], audienceMembers: Row[] = []) {
  const state = { apps: apps.map((app) => ({ ...app })), audienceMembers: audienceMembers.map((row) => ({ ...row })) };
  const assignments = [
    { uid: 'pa-1', memberUid: FOUNDER, code: 'founder_plc_crypto' },
    { uid: 'pa-2', memberUid: PENDING, code: 'founder_plc_crypto' },
    { uid: 'pa-3', memberUid: INVESTOR, code: 'investor_pl' },
  ];
  const held = (where: Row) =>
    assignments.filter(
      (row) => row.memberUid === where.memberUid && (!where.policy?.code?.in || where.policy.code.in.includes(row.code))
    );
  const matchesOne = (app: Row, where: Row): boolean =>
    (where.appId === undefined || app.appId === where.appId) &&
    (where.uid === undefined ||
      ((typeof where.uid === 'string' ? app.uid === where.uid : true) &&
        (where.uid.in === undefined || where.uid.in.includes(app.uid)) &&
        (where.uid.not === undefined || app.uid !== where.uid.not))) &&
    (where.path === undefined || app.path === where.path) &&
    (where.status?.not === undefined || app.status !== where.status.not) &&
    (where.status?.notIn === undefined || !where.status.notIn.includes(app.status)) &&
    (where.lastDeployedAt === undefined || app.lastDeployedAt !== null) &&
    (where.audiencePolicyCodes?.hasSome === undefined ||
      app.audiencePolicyCodes.some((code: string) => where.audiencePolicyCodes.hasSome.includes(code))) &&
    (where.audiencePermissionCodes?.hasSome === undefined ||
      app.audiencePermissionCodes.some((code: string) => where.audiencePermissionCodes.hasSome.includes(code))) &&
    (where.OR === undefined || where.OR.some((alt: Row) => matchesOne(app, alt)));
  const prisma: any = {
    state,
    aiApp: {
      findFirst: jest.fn(async ({ where }) => state.apps.find((app) => matchesOne(app, where)) ?? null),
      findMany: jest.fn(async ({ where }) => state.apps.filter((app) => matchesOne(app, where))),
      update: jest.fn(async ({ where, data }) => {
        const app = state.apps.find((row) => row.uid === where.uid)!;
        Object.assign(app, data);
        return { ...app };
      }),
    },
    aiAppAudienceMember: {
      findUnique: jest.fn(
        async ({ where }) =>
          state.audienceMembers.find(
            (row) => row.appUid === where.appUid_memberUid.appUid && row.memberUid === where.appUid_memberUid.memberUid
          ) ?? null
      ),
      findMany: jest.fn(async ({ where }) =>
        state.audienceMembers.filter(
          (row) =>
            (where.appUid === undefined || row.appUid === where.appUid) &&
            (where.memberUid === undefined || row.memberUid === where.memberUid)
        )
      ),
      deleteMany: jest.fn(async ({ where }) => {
        state.audienceMembers = state.audienceMembers.filter(
          (row) => !(row.appUid === where.appUid && where.memberUid.in.includes(row.memberUid))
        );
        return { count: 0 };
      }),
      createMany: jest.fn(async ({ data }) => {
        state.audienceMembers.push(...data);
        return { count: data.length };
      }),
    },
    $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    memberApproval: {
      findUnique: jest.fn(async ({ where }) =>
        APPROVAL[where.memberUid] ? { state: APPROVAL[where.memberUid] } : null
      ),
    },
    member: {
      findMany: jest.fn(async ({ where }) => MEMBERS.filter((member) => where.uid.in.includes(member.uid))),
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
    permission: {
      findMany: jest.fn(async ({ where }) =>
        ['plaa.member', 'plaa.guest', 'ai_apps.read']
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
  const accessControl = {
    hasPermission: jest.fn(async (memberUid: string, code: string) => ({
      memberUid,
      permissionCode: code,
      allowed: (memberUid === INFRA && code === 'ai_apps.read') || memberUid === OWNER,
    })),
    getMemberAccess: jest.fn(async (memberUid: string) => ({
      memberUid,
      effectivePermissions: EFFECTIVE_PERMISSIONS[memberUid] ?? [],
    })),
  };
  const audienceService = new AiAppsAudienceService(prisma, accessControl as any);
  const rbacService = { hasPermission: jest.fn(async () => false) };
  const accessService = new AiAppsAccessService(
    prisma,
    aiAppsService,
    rbacService as any,
    accessControl as any,
    undefined,
    audienceService
  );
  return { prisma, audienceService, accessService, accessControl };
}

const reason = async (denied: Promise<unknown>) =>
  denied.then(
    () => 'allowed',
    (error: ForbiddenException) => (error.getResponse() as Row).reason
  );

describe('isInAudience', () => {
  it('an unpublished app, an unknown member or no app is never in an audience', async () => {
    const { audienceService } = buildServices();
    await expect(audienceService.isInAudience(FOUNDER, INTERNAL_APP)).resolves.toBe(false);
    await expect(audienceService.isInAudience(undefined, PUBLISHED_APP)).resolves.toBe(false);
    await expect(audienceService.isInAudience(FOUNDER, null)).resolves.toBe(false);
  });

  it.each([
    ['an approved member holding one of the policies', FOUNDER, true],
    ['an approved member holding other policies', INVESTOR, false],
    ['a member holding the policy who is not approved', PENDING, false],
    ['a member with no policies', 'nobody', false],
  ])('by policy: %s → %s', async (_label, memberUid, expected) => {
    const { audienceService } = buildServices();
    await expect(audienceService.isInAudience(memberUid, PUBLISHED_APP)).resolves.toBe(expected);
  });

  it.each([
    ['an approved member with the permission', PLA, true],
    ['a member with the permission who is not approved', PENDING, false],
    ['an approved member without it', INVESTOR, false],
  ])('by permission: %s → %s', async (_label, memberUid, expected) => {
    const { audienceService } = buildServices(buildPrisma([PLA_APP]));
    await expect(audienceService.isInAudience(memberUid, PLA_APP)).resolves.toBe(expected);
  });

  it('by member: only the members named on the app, and only once approved', async () => {
    const prisma = buildPrisma(
      [INTERNAL_APP],
      [
        { appUid: 'app-internal', memberUid: PICKED },
        { appUid: 'app-internal', memberUid: PENDING },
      ]
    );
    const { audienceService } = buildServices(prisma);
    await expect(audienceService.isInAudience(PICKED, INTERNAL_APP)).resolves.toBe(true);
    await expect(audienceService.isInAudience(PENDING, INTERNAL_APP)).resolves.toBe(false);
    await expect(audienceService.isInAudience(FOUNDER, INTERNAL_APP)).resolves.toBe(false);
  });

  it('does not read permissions when the app has no permission audience', async () => {
    const { audienceService, accessControl } = buildServices();
    await audienceService.isInAudience(INVESTOR, PUBLISHED_APP);
    expect(accessControl.getMemberAccess).not.toHaveBeenCalled();
  });

  it('resolves the app by appId, whatever kind of audience it has', async () => {
    const { audienceService } = buildServices(buildPrisma([PUBLISHED_APP, INTERNAL_APP, PLA_APP]));
    await expect(audienceService.isInAudienceOfAppId(FOUNDER, 'playbook')).resolves.toBe(true);
    await expect(audienceService.isInAudienceOfAppId(PLA, 'pla-portal')).resolves.toBe(true);
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

  it('lets a permission audience in, even when the app is hidden from More', async () => {
    const { accessService } = buildServices(buildPrisma([PLA_APP]));
    await expect(accessService.checkAccess(PLA, 'pla-portal', 'GET')).resolves.toEqual({
      allowed: true,
      reason: 'audience',
    });
    await expect(reason(accessService.checkAccess(INVESTOR, 'pla-portal', 'GET'))).resolves.toBe('permission');
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
    await audienceService.updateAudience('admin-1', 'playbook', { policyCodes: [] });
    await expect(reason(accessService.checkAccess(FOUNDER, 'playbook', 'GET'))).resolves.toBe('permission');
  });

  it('removing a member from the list blocks their next request', async () => {
    const prisma = buildPrisma([INTERNAL_APP], [{ appUid: 'app-internal', memberUid: PICKED }]);
    const { accessService, audienceService } = buildServices(prisma);
    await expect(accessService.checkAccess(PICKED, 'internal-tool', 'GET')).resolves.toEqual({
      allowed: true,
      reason: 'audience',
    });
    await audienceService.updateAudience('admin-1', 'internal-tool', { policyCodes: [], memberUids: [] });
    await expect(reason(accessService.checkAccess(PICKED, 'internal-tool', 'GET'))).resolves.toBe('permission');
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
  const PLAYBOOK_VIEW = {
    uid: 'app-published',
    appId: 'playbook',
    name: 'Playbook',
    description: 'Shared prompts',
    url: 'https://playbook.example.test',
    path: null,
    iconUrl: null,
    showInMore: true,
    hideTopNav: false,
  };

  it('lists only live apps published to a policy the member holds', async () => {
    const { accessService } = buildServices();
    await expect(accessService.listPublishedApps(FOUNDER)).resolves.toEqual([PLAYBOOK_VIEW]);
    await expect(accessService.listPublishedApps(INVESTOR)).resolves.toEqual([]);
    await expect(accessService.listPublishedApps(PENDING)).resolves.toEqual([]);
  });

  it('lists apps published by permission or by name, with their LabOS settings, hidden-from-More ones included', async () => {
    const prisma = buildPrisma([PUBLISHED_APP, INTERNAL_APP, PLA_APP], [{ appUid: 'app-internal', memberUid: PICKED }]);
    const { accessService } = buildServices(prisma);
    await expect(accessService.listPublishedApps(PLA)).resolves.toEqual([
      {
        uid: 'app-pla',
        appId: 'pla-portal',
        name: 'PLA portal',
        description: 'Shared prompts',
        url: 'https://pla.example.test',
        path: 'pla',
        iconUrl: 'https://cdn.example.test/pla.png',
        showInMore: false,
        hideTopNav: true,
      },
    ]);
    await expect(accessService.listPublishedApps(PICKED)).resolves.toEqual([
      expect.objectContaining({ uid: 'app-internal', url: expect.stringContaining('internal-tool') }),
    ]);
  });

  it('skips the app query for an approved member matching nothing, and for a member who is not approved', async () => {
    const { accessService, prisma } = buildServices();
    await expect(accessService.listPublishedApps(PICKED)).resolves.toEqual([]);
    await expect(accessService.listPublishedApps(PENDING)).resolves.toEqual([]);
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
  it('returns the current settings and 404s an unknown app', async () => {
    const prisma = buildPrisma([PUBLISHED_APP, PLA_APP], [{ appUid: 'app-pla', memberUid: PICKED }]);
    const { audienceService } = buildServices(prisma);
    await expect(audienceService.getAudience('playbook')).resolves.toEqual({
      appUid: 'app-published',
      appId: 'playbook',
      name: 'Playbook',
      policyCodes: ['founder_plc_crypto'],
      permissionCodes: [],
      members: [],
      showInMore: true,
      path: null,
      iconUrl: null,
      hideTopNav: false,
      directLinkGateReady: true,
    });
    await expect(audienceService.getAudience('pla-portal')).resolves.toMatchObject({
      permissionCodes: ['plaa.member'],
      members: [{ uid: PICKED, name: 'Picked Founder', email: 'picked@example.test' }],
      showInMore: false,
      path: 'pla',
      iconUrl: 'https://cdn.example.test/pla.png',
      hideTopNav: true,
    });
    await expect(audienceService.getAudience('not-ours')).rejects.toThrow(NotFoundException);
  });

  it('saves deduplicated, sorted policy codes and audits the change (v0 body)', async () => {
    const { audienceService, prisma } = buildServices();
    const saved = await audienceService.updateAudience('admin-1', 'internal-tool', {
      policyCodes: ['investor_pl', 'founder_plc_crypto', 'investor_pl'],
    });
    expect(saved.policyCodes).toEqual(['founder_plc_crypto', 'investor_pl']);
    expect(prisma.aiApp.update).toHaveBeenCalledWith({
      where: { uid: 'app-internal' },
      data: {
        audiencePolicyCodes: ['founder_plc_crypto', 'investor_pl'],
        audiencePermissionCodes: [],
        showInMore: true,
        hideTopNav: false,
        path: null,
        iconUrl: null,
      },
    });
    expect(prisma.aiAppEvent.create).toHaveBeenCalledWith({
      data: {
        type: 'AUDIENCE_UPDATED',
        memberUid: 'admin-1',
        appUid: 'app-internal',
        appId: 'internal-tool',
        message:
          'Audience settings: {"policyCodes":["founder_plc_crypto","investor_pl"],"permissionCodes":[],"memberUids":[],"showInMore":true,"path":null,"iconUrl":null,"hideTopNav":false}',
      },
    });
  });

  it('saves permissions, members and the LabOS settings together', async () => {
    const { audienceService, prisma } = buildServices();
    const saved = await audienceService.updateAudience('admin-1', 'internal-tool', {
      policyCodes: [],
      permissionCodes: ['plaa.member'],
      memberUids: [PICKED, PLA, PICKED],
      showInMore: false,
      path: '  PLA ',
      iconUrl: 'https://cdn.example.test/pla.png',
      hideTopNav: true,
    });
    expect(saved).toMatchObject({
      permissionCodes: ['plaa.member'],
      members: [
        { uid: PICKED, name: 'Picked Founder' },
        { uid: PLA, name: 'Pla Participant' },
      ],
      showInMore: false,
      path: 'pla',
      iconUrl: 'https://cdn.example.test/pla.png',
      hideTopNav: true,
    });
    expect(prisma.state.audienceMembers).toEqual([
      { appUid: 'app-internal', memberUid: PICKED, addedByUid: 'admin-1' },
      { appUid: 'app-internal', memberUid: PLA, addedByUid: 'admin-1' },
    ]);
  });

  it('leaves fields an older Back Office does not send as they are', async () => {
    const prisma = buildPrisma([PLA_APP], [{ appUid: 'app-pla', memberUid: PICKED }]);
    const { audienceService } = buildServices(prisma);
    const saved = await audienceService.updateAudience('admin-1', 'pla-portal', { policyCodes: ['investor_pl'] });
    expect(saved).toMatchObject({
      policyCodes: ['investor_pl'],
      permissionCodes: ['plaa.member'],
      members: [{ uid: PICKED }],
      showInMore: false,
      path: 'pla',
      hideTopNav: true,
    });
  });

  it.each([
    ['policy codes', { policyCodes: ['investor_pl', 'no_such_policy'] }, { unknownPolicyCodes: ['no_such_policy'] }],
    [
      'permission codes',
      { policyCodes: [], permissionCodes: ['plaa.member', 'no.such'] },
      { unknownPermissionCodes: ['no.such'] },
    ],
    ['members', { policyCodes: [], memberUids: [PICKED, 'ghost'] }, { unknownMemberUids: ['ghost'] }],
    ['an invalid path', { policyCodes: [], path: 'Not a path!' }, { code: 'invalid_path' }],
    ['a uid-shaped path', { policyCodes: [], path: 'cmu73kls90763n94gzz6s9fmq' }, { code: 'invalid_path' }],
    ['an http icon', { policyCodes: [], iconUrl: 'http://cdn.example.test/x.png' }, { code: 'invalid_icon_url' }],
  ])('rejects unknown %s and saves nothing', async (_label, body, response) => {
    const { audienceService, prisma } = buildServices();
    const rejected = audienceService.updateAudience('admin-1', 'playbook', body as any);
    await expect(rejected).rejects.toThrow(BadRequestException);
    await rejected.catch((error: BadRequestException) => expect(error.getResponse()).toMatchObject(response));
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
  });

  it('refuses a path another app already uses', async () => {
    const { audienceService, prisma } = buildServices(buildPrisma([PUBLISHED_APP, PLA_APP]));
    const rejected = audienceService.updateAudience('admin-1', 'playbook', { policyCodes: [], path: 'pla' });
    await expect(rejected).rejects.toThrow(ConflictException);
    await rejected.catch((error: ConflictException) =>
      expect(error.getResponse()).toMatchObject({ code: 'path_taken' })
    );
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
    // Saving an app's own path again is fine.
    await expect(
      audienceService.updateAudience('admin-1', 'pla-portal', { policyCodes: [], path: 'pla' })
    ).resolves.toMatchObject({ path: 'pla' });
  });

  it('clears the path and the icon with null or blank', async () => {
    const { audienceService } = buildServices(buildPrisma([PLA_APP]));
    await expect(
      audienceService.updateAudience('admin-1', 'pla-portal', { policyCodes: [], path: '', iconUrl: null })
    ).resolves.toMatchObject({ path: null, iconUrl: null });
  });

  it('saving the stored values again is a no-op', async () => {
    const prisma = buildPrisma([PLA_APP], [{ appUid: 'app-pla', memberUid: PICKED }]);
    const { audienceService } = buildServices(prisma);
    await audienceService.updateAudience('admin-1', 'pla-portal', {
      policyCodes: [],
      permissionCodes: ['plaa.member'],
      memberUids: [PICKED],
      showInMore: false,
      path: 'pla',
      iconUrl: 'https://cdn.example.test/pla.png',
      hideTopNav: true,
    });
    expect(prisma.aiApp.update).not.toHaveBeenCalled();
    expect(prisma.aiAppEvent.create).not.toHaveBeenCalled();
  });

  it('emptying every audience list takes the app back', async () => {
    const { audienceService, prisma } = buildServices();
    await expect(audienceService.updateAudience('admin-1', 'playbook', { policyCodes: [] })).resolves.toMatchObject({
      policyCodes: [],
      permissionCodes: [],
      members: [],
    });
    expect(prisma.aiAppEvent.create).toHaveBeenCalledTimes(1);
  });

  it('validates the request body', () => {
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: ['investor_pl'] }).success).toBe(true);
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: [] }).success).toBe(true);
    expect(
      UpdateAiAppAudienceSchema.safeParse({
        policyCodes: [],
        permissionCodes: ['plaa.member'],
        memberUids: [PICKED],
        showInMore: false,
        path: null,
        iconUrl: null,
        hideTopNav: true,
      }).success
    ).toBe(true);
    expect(UpdateAiAppAudienceSchema.safeParse({}).success).toBe(false);
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: [''] }).success).toBe(false);
    expect(UpdateAiAppAudienceSchema.safeParse({ policyCodes: [], showInMore: 'yes' }).success).toBe(false);
  });

  it.each([
    ['pla', 'pla'],
    ['PLA-Portal', 'pla-portal'],
    ['ab', 'ab'],
    ['', null],
    [null, null],
  ])('normalizes the path %p to %p', (input, expected) => {
    expect(normalizePath(input as string | null)).toBe(expected);
  });

  it.each(['a', '-pla', 'pla-', 'pl--a', 'pla/x', 'p'.repeat(61)])('rejects the path %p', (input) => {
    expect(() => normalizePath(input)).toThrow(BadRequestException);
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
    const body = { policyCodes: ['investor_pl'], permissionCodes: ['plaa.member'], showInMore: false };
    await controller.update('playbook', body as any, { user: { memberUid: 'admin-1' } });
    expect(audienceService.updateAudience).toHaveBeenCalledWith('admin-1', 'playbook', body);
  });
});

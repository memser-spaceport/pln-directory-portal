/// <reference types="multer" />
import { BadRequestException, ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and the feedback paths
// under test never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AiAppsService } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { AiAppTokenGuard } from './guards/ai-app-token.guard';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { AgentUpdateFeedbackStatusSchema } from './dto/update-feedback-status.dto';

const APP = { uid: 'app-1', memberUid: 'owner-1', appId: 'demo', access: 'OPEN', status: 'READY' };
const HTML = '<p>Broken chart</p><img src="https://pl-directory-images-prod.s3.us-west-1.amazonaws.com/x.png">';
const ROWS = [
  { uid: 'fb-2', appUid: 'app-1', memberUid: 'member-1', text: HTML, status: 'NEW', createdAt: new Date(2) },
  { uid: 'fb-1', appUid: 'app-1', memberUid: 'member-2', text: 'ok', status: 'IMPLEMENTED', createdAt: new Date(1) },
];

function buildService(app: any = APP) {
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(app) },
    aiAppFeedback: {
      findMany: jest.fn().mockResolvedValue(ROWS),
      findUnique: jest.fn().mockResolvedValue(ROWS[0]),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...ROWS[0], ...data })),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([
        { uid: 'member-1', name: 'Ada', image: { url: 'https://img/ada.png' } },
        { uid: 'member-2', name: 'Bob', image: null },
      ]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
  const service = new AiAppsService(
    prisma as any,
    {} as any,
    { create: jest.fn() } as any,
    { trackEvent: jest.fn() } as any
  );
  return { service, prisma };
}

describe('AiAppsService agent feedback', () => {
  describe('listAgentFeedback', () => {
    it('returns every status newest first with verbatim HTML and submitter info', async () => {
      const { service, prisma } = buildService();
      const result = await service.listAgentFeedback('owner-1', 'app-1');

      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: 'app-1' },
        orderBy: { createdAt: 'desc' },
        include: {
          pins: { select: expect.any(Object), orderBy: { n: 'asc' } },
          _count: { select: { comments: true } },
          comments: { select: expect.any(Object), orderBy: { createdAt: 'asc' } },
        },
      });
      expect(result.map((row) => row.uid)).toEqual(['fb-2', 'fb-1']);
      expect(result[0].text).toBe(HTML);
      expect(result[0].member).toEqual({ uid: 'member-1', name: 'Ada', image: 'https://img/ada.png' });
      expect(result[1].member).toEqual({ uid: 'member-2', name: 'Bob', image: null });
    });

    it('narrows to one status when asked', async () => {
      const { service, prisma } = buildService();
      await service.listAgentFeedback('owner-1', 'app-1', 'NEW');
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: 'app-1', status: 'NEW' },
        orderBy: { createdAt: 'desc' },
        include: {
          pins: { select: expect.any(Object), orderBy: { n: 'asc' } },
          _count: { select: { comments: true } },
          comments: { select: expect.any(Object), orderBy: { createdAt: 'asc' } },
        },
      });
    });

    it('returns an empty list for an app without feedback', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findMany.mockResolvedValue([]);
      await expect(service.listAgentFeedback('owner-1', 'app-1')).resolves.toEqual([]);
    });

    it("rejects a deploy token for another member's app", async () => {
      const { service, prisma } = buildService();
      await expect(service.listAgentFeedback('other-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.aiAppFeedback.findMany).not.toHaveBeenCalled();
    });

    it('rejects a deployment key issued for a different app', async () => {
      const { service } = buildService();
      await expect(
        service.listAgentFeedback('owner-1', 'app-1', undefined, { appUid: 'app-2', environment: 'prod' })
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("accepts a preview deployment key for the app's feedback", async () => {
      const { service } = buildService();
      const result = await service.listAgentFeedback('owner-1', 'app-1', undefined, {
        appUid: 'app-1',
        environment: 'preview',
      });
      expect(result).toHaveLength(2);
    });

    it.each([
      ['unknown', null],
      ['deleted', { ...APP, status: 'DELETED' }],
    ])('404s for an %s app', async (_label, app) => {
      const { service } = buildService(app);
      await expect(service.listAgentFeedback('owner-1', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateAgentFeedbackStatus', () => {
    it.each(['VIEWED', 'IMPLEMENTED'] as const)('sets %s and returns the updated row', async (status) => {
      const { service, prisma } = buildService();
      const result = await service.updateAgentFeedbackStatus('owner-1', 'app-1', 'fb-2', status);
      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({ where: { uid: 'fb-2' }, data: { status } });
      expect(result.status).toBe(status);
      expect(result.member).toEqual({ uid: 'member-1', name: 'Ada', image: 'https://img/ada.png' });
    });

    it('allows moving IMPLEMENTED back to VIEWED', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue(ROWS[1]);
      const result = await service.updateAgentFeedbackStatus('owner-1', 'app-1', 'fb-1', 'VIEWED');
      expect(result.status).toBe('VIEWED');
    });

    it('404s for a feedback uid that belongs to another app', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...ROWS[0], appUid: 'app-2' });
      await expect(service.updateAgentFeedbackStatus('owner-1', 'app-1', 'fb-2', 'VIEWED')).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
    });

    it('rejects non-owners and foreign deployment keys before touching the row', async () => {
      const { service, prisma } = buildService();
      await expect(service.updateAgentFeedbackStatus('other-1', 'app-1', 'fb-2', 'VIEWED')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      await expect(
        service.updateAgentFeedbackStatus('owner-1', 'app-1', 'fb-2', 'VIEWED', {
          appUid: 'app-2',
          environment: 'prod',
        })
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.aiAppFeedback.findUnique).not.toHaveBeenCalled();
    });
  });
});

describe('AgentUpdateFeedbackStatusSchema', () => {
  it.each(['VIEWED', 'IMPLEMENTED'])('accepts %s', (status) => {
    expect(AgentUpdateFeedbackStatusSchema.safeParse({ status }).success).toBe(true);
  });

  it.each(['NEW', 'DONE', undefined])('rejects %s', (status) => {
    expect(AgentUpdateFeedbackStatusSchema.safeParse({ status }).success).toBe(false);
  });
});

describe('AiAppsController feedback routes', () => {
  const proto = AiAppsController.prototype as any;

  it.each([
    ['listAgentFeedback', ':uid/agent/feedback', RequestMethod.GET],
    ['updateAgentFeedbackStatus', ':uid/agent/feedback/:feedbackUid', RequestMethod.PATCH],
  ])('%s: agent route on %s guarded by AiAppTokenGuard only', (name, path, method) => {
    const handler = proto[name];
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(method);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([AiAppTokenGuard]);
  });

  it.each(['listFeedback', 'updateFeedbackStatus', 'listAccessibleFeedback'])(
    '%s: member route stays on member JWT + RBAC',
    (name) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, proto[name])).toEqual([UserTokenCheckGuard, RbacGuard]);
    }
  );

  describe('status query parsing', () => {
    function buildController() {
      const aiAppsService = { listAgentFeedback: jest.fn().mockResolvedValue([]) };
      const controller = Object.create(AiAppsController.prototype);
      controller.aiAppsService = aiAppsService;
      return { controller, aiAppsService };
    }
    const req = { aiAppMemberUid: 'owner-1', aiAppKeyScope: undefined };

    it('uppercases a valid status', async () => {
      const { controller, aiAppsService } = buildController();
      await controller.listAgentFeedback('app-1', req, 'new');
      expect(aiAppsService.listAgentFeedback).toHaveBeenCalledWith('owner-1', 'app-1', 'NEW', undefined);
    });

    it('passes no filter when status is omitted', async () => {
      const { controller, aiAppsService } = buildController();
      await controller.listAgentFeedback('app-1', req);
      expect(aiAppsService.listAgentFeedback).toHaveBeenCalledWith('owner-1', 'app-1', undefined, undefined);
    });

    it('400s on an unknown status', async () => {
      const { controller, aiAppsService } = buildController();
      await expect(controller.listAgentFeedback('app-1', req, 'DONE')).rejects.toBeInstanceOf(BadRequestException);
      expect(aiAppsService.listAgentFeedback).not.toHaveBeenCalled();
    });
  });
});

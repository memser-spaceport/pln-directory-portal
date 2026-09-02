/// <reference types="multer" />
import { ForbiddenException, NotFoundException, BadRequestException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and the feedback paths
// under test never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

// The real module pulls in a transitive chain that breaks under ts-jest (an
// ESM-only nestjs-zod import); mock it like roadmap.service.spec.ts does.
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { AiAppsService } from './ai-apps.service';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo' };
const FEEDBACK = {
  uid: 'fb-1',
  appUid: 'app-1',
  memberUid: 'member-1',
  text: 'please add dark mode',
  status: 'NEW',
  createdAt: new Date(1),
};

function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    aiApp: {
      findUnique: jest.fn().mockResolvedValue(APP),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiAppFeedback: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'fb-1', createdAt: new Date(0), status: 'NEW', ...data })
        ),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(FEEDBACK),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...FEEDBACK, ...data })),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
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

describe('AiAppsService feedback', () => {
  describe('submitFeedback', () => {
    it('throws 404 when the app does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findUnique.mockResolvedValue(null);
      await expect(service.submitFeedback('member-1', 'missing', 'hi')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('stores feedback for any member and allows repeat submissions', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', 'first');
      await service.submitFeedback('member-1', 'app-1', 'second');
      expect(prisma.aiAppFeedback.create).toHaveBeenCalledTimes(2);
      expect(prisma.aiAppFeedback.create).toHaveBeenLastCalledWith({
        data: { appUid: 'app-1', memberUid: 'member-1', text: 'second' },
      });
    });

    it('defaults status to NEW without sending it in the create payload', async () => {
      const { service, prisma } = buildService();
      const result = await service.submitFeedback('member-1', 'app-1', 'hi');
      expect(prisma.aiAppFeedback.create).toHaveBeenCalledWith({
        data: { appUid: 'app-1', memberUid: 'member-1', text: 'hi' },
      });
      expect(result.status).toBe('NEW');
    });

    it('returns the submitter as `member` instead of raw memberUid', async () => {
      const { service, prisma } = buildService();
      prisma.member.findMany.mockResolvedValue([{ uid: 'member-1', name: 'Ada', image: { url: 'https://…/ada.png' } }]);
      const result = await service.submitFeedback('member-1', 'app-1', 'hi');
      // The Prisma image relation is flattened to its plain URL.
      expect(result.member).toEqual({ uid: 'member-1', name: 'Ada', image: 'https://…/ada.png' });
      expect(result).not.toHaveProperty('memberUid');
    });

    it('stores sanitized HTML and strips scripts', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p>hi<script>alert(1)</script></p>');
      const stored = prisma.aiAppFeedback.create.mock.calls[0][0].data.text as string;
      expect(stored).toContain('hi');
      expect(stored).not.toMatch(/script/i);
    });

    it('rejects empty Quill markup', async () => {
      const { service, prisma } = buildService();
      await expect(service.submitFeedback('member-1', 'app-1', '<p><br></p>')).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(prisma.aiAppFeedback.create).not.toHaveBeenCalled();
    });

    it('accepts image-only feedback', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p><img src="https://cdn.example/x.png" alt="shot"></p>');
      const stored = prisma.aiAppFeedback.create.mock.calls[0][0].data.text as string;
      expect(stored).toMatch(/img/i);
      expect(stored).toContain('https://cdn.example/x.png');
    });

    it('strips inline data-URI images before storing', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p>hi</p><p><img src="data:image/png;base64,AAAA"></p>');
      const stored = prisma.aiAppFeedback.create.mock.calls[0][0].data.text as string;
      expect(stored).toContain('hi');
      expect(stored).not.toContain('data:image');
      expect(stored).not.toContain('AAAA');
    });
  });

  describe('listFeedback', () => {
    it('throws 404 when the app does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findUnique.mockResolvedValue(null);
      await expect(service.listFeedback('creator-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('allows the app creator', async () => {
      const { service, prisma } = buildService();
      await expect(service.listFeedback('creator-1', 'app-1')).resolves.toEqual([]);
      // No admin lookup needed for the creator.
      expect(prisma.member.findUnique).not.toHaveBeenCalled();
    });

    it('allows a directory admin who is not the creator', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
      await expect(service.listFeedback('admin-1', 'app-1')).resolves.toEqual([]);
    });

    it('rejects a regular viewer who is neither creator nor admin', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });
      await expect(service.listFeedback('viewer-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('returns feedback newest first with submitter info and status', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findMany.mockResolvedValue([
        {
          uid: 'fb-2',
          appUid: 'app-1',
          memberUid: 'member-2',
          text: 'later',
          status: 'VIEWED',
          createdAt: new Date(2),
        },
        {
          uid: 'fb-1',
          appUid: 'app-1',
          memberUid: 'member-1',
          text: 'earlier',
          status: 'NEW',
          createdAt: new Date(1),
        },
      ]);
      prisma.member.findMany.mockResolvedValue([{ uid: 'member-2', name: 'Bea', image: null }]);

      const result = await service.listFeedback('creator-1', 'app-1');
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: 'app-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.map((f) => f.text)).toEqual(['later', 'earlier']);
      expect(result.map((f) => f.status)).toEqual(['VIEWED', 'NEW']);
      // A member without a profile image resolves to image: null.
      expect(result[0].member).toEqual({ uid: 'member-2', name: 'Bea', image: null });
      // Unknown submitter resolves to null rather than leaking the uid.
      expect(result[1].member).toBeNull();
    });
  });

  describe('listAccessibleFeedback', () => {
    it('returns an empty list when the requester owns no apps and is not an admin', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });
      await expect(service.listAccessibleFeedback('creator-1')).resolves.toEqual([]);
      expect(prisma.aiApp.findMany).toHaveBeenCalledWith({
        where: { memberUid: 'creator-1', status: { not: 'DELETED' } },
        select: { uid: true, name: true },
      });
      expect(prisma.aiAppFeedback.findMany).not.toHaveBeenCalled();
    });

    it('returns feedback only for apps the requester created when not an admin', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });
      prisma.aiApp.findMany.mockResolvedValue([{ uid: 'app-1', name: 'Alpha' }]);
      prisma.aiAppFeedback.findMany.mockResolvedValue([FEEDBACK]);

      const result = await service.listAccessibleFeedback('creator-1');
      expect(prisma.aiApp.findMany).toHaveBeenCalledWith({
        where: { memberUid: 'creator-1', status: { not: 'DELETED' } },
        select: { uid: true, name: true },
      });
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: { in: ['app-1'] } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toHaveLength(1);
      expect(result[0].appName).toBe('Alpha');
    });

    it('returns feedback across every non-deleted app for a directory admin', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
      prisma.aiApp.findMany.mockResolvedValue([
        { uid: 'app-1', name: 'Alpha' },
        { uid: 'app-2', name: 'Beta' },
      ]);
      prisma.aiAppFeedback.findMany.mockResolvedValue([
        { ...FEEDBACK, uid: 'fb-2', appUid: 'app-2', text: 'later', createdAt: new Date(2) },
        FEEDBACK,
      ]);

      const result = await service.listAccessibleFeedback('admin-1');
      expect(prisma.aiApp.findMany).toHaveBeenCalledWith({
        where: { status: { not: 'DELETED' } },
        select: { uid: true, name: true },
      });
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: { in: ['app-1', 'app-2'] } },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.map((row) => row.appName)).toEqual(['Beta', 'Alpha']);
    });
  });

  describe('updateFeedbackStatus', () => {
    it('throws 404 when the app does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findUnique.mockResolvedValue(null);
      await expect(service.updateFeedbackStatus('creator-1', 'missing', 'fb-1', 'VIEWED')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('throws 404 when the feedback does not exist', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue(null);
      await expect(service.updateFeedbackStatus('creator-1', 'app-1', 'missing', 'VIEWED')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });

    it('throws 404 when the feedback belongs to a different app', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...FEEDBACK, appUid: 'other-app' });
      await expect(service.updateFeedbackStatus('creator-1', 'app-1', 'fb-1', 'VIEWED')).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
    });

    it('rejects a regular viewer who is neither creator nor admin', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [] });
      await expect(service.updateFeedbackStatus('viewer-1', 'app-1', 'fb-1', 'VIEWED')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
    });

    it('lets the app creator set status', async () => {
      const { service, prisma } = buildService();
      const result = await service.updateFeedbackStatus('creator-1', 'app-1', 'fb-1', 'VIEWED');
      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({
        where: { uid: 'fb-1' },
        data: { status: 'VIEWED' },
      });
      expect(result.status).toBe('VIEWED');
    });

    it('lets a directory admin set status', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
      const result = await service.updateFeedbackStatus('admin-1', 'app-1', 'fb-1', 'VIEWED');
      expect(result.status).toBe('VIEWED');
    });

    it('allows skipping from NEW to IMPLEMENTED', async () => {
      const { service } = buildService();
      const result = await service.updateFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED');
      expect(result.status).toBe('IMPLEMENTED');
    });

    it('allows moving backwards from IMPLEMENTED to VIEWED', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...FEEDBACK, status: 'IMPLEMENTED' });
      const result = await service.updateFeedbackStatus('creator-1', 'app-1', 'fb-1', 'VIEWED');
      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({
        where: { uid: 'fb-1' },
        data: { status: 'VIEWED' },
      });
      expect(result.status).toBe('VIEWED');
    });
  });
});

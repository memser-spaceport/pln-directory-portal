/// <reference types="multer" />
import { ForbiddenException, NotFoundException } from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and the feedback paths
// under test never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));

import { AiAppsService } from './ai-apps.service';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo' };

function buildService(overrides: Record<string, any> = {}) {
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(APP) },
    aiAppFeedback: {
      create: jest
        .fn()
        .mockImplementation(({ data }) => Promise.resolve({ uid: 'fb-1', createdAt: new Date(0), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    ...overrides,
  };
  return { service: new AiAppsService(prisma as any, {} as any), prisma };
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

    it('returns the submitter as `member` instead of raw memberUid', async () => {
      const { service, prisma } = buildService();
      prisma.member.findMany.mockResolvedValue([{ uid: 'member-1', name: 'Ada' }]);
      const result = await service.submitFeedback('member-1', 'app-1', 'hi');
      expect(result.member).toEqual({ uid: 'member-1', name: 'Ada', image: null });
      expect(result).not.toHaveProperty('memberUid');
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

    it('returns feedback newest first with submitter info', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findMany.mockResolvedValue([
        { uid: 'fb-2', appUid: 'app-1', memberUid: 'member-2', text: 'later', createdAt: new Date(2) },
        { uid: 'fb-1', appUid: 'app-1', memberUid: 'member-1', text: 'earlier', createdAt: new Date(1) },
      ]);
      prisma.member.findMany.mockResolvedValue([{ uid: 'member-2', name: 'Bea' }]);

      const result = await service.listFeedback('creator-1', 'app-1');
      expect(prisma.aiAppFeedback.findMany).toHaveBeenCalledWith({
        where: { appUid: 'app-1' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result.map((f) => f.text)).toEqual(['later', 'earlier']);
      expect(result[0].member).toEqual({ uid: 'member-2', name: 'Bea', image: null });
      // Unknown submitter resolves to null rather than leaking the uid.
      expect(result[1].member).toBeNull();
    });
  });
});

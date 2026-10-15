import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';

// Factories keep Jest away from axios's ESM build and the AiAppsService import chain.
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('./ai-apps.service', () => ({ AiAppsService: jest.fn() }));

import { AiAppsLinearService } from './ai-apps-linear.service';

const ADMIN_ROLES = [{ name: 'DIRECTORYADMIN' }];
const TEAMS = [
  { id: 'tA', key: 'ALP', name: 'Alpha', private: true, projects: [{ id: 'pA', name: 'Roadmap' }] },
  { id: 'tB', key: 'BET', name: 'Beta', private: true, projects: [] },
  { id: 'tC', key: 'PUB', name: 'Public', private: false, projects: [] },
  { id: 'tD', key: 'DEL', name: 'Delta', private: true, projects: [] },
];

describe('AiAppsLinearService', () => {
  const saved: Record<string, string | undefined> = {};
  let prisma: {
    aiApp: { findUnique: jest.Mock; update: jest.Mock };
    member: { findUnique: jest.Mock };
    aiAppFeedback: { findMany: jest.Mock };
    feedbackLinearIssue: { updateMany: jest.Mock };
  };
  let aiApps: { isCreatorOrDirectoryAdmin: jest.Mock };
  let linear: { teams: jest.Mock; team: jest.Mock; userByEmail: jest.Mock };
  let service: AiAppsLinearService;

  const app = {
    uid: 'app1',
    memberUid: 'owner',
    status: 'READY',
    linearTeamId: null,
    linearProjectId: null,
    linearTargetSetAt: null,
  };

  beforeEach(() => {
    for (const key of ['FEEDBACK_LINEAR_CLIENT_ID', 'FEEDBACK_LINEAR_CLIENT_SECRET']) saved[key] = process.env[key];
    process.env.FEEDBACK_LINEAR_CLIENT_ID = 'cid';
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = 'secret';
    prisma = {
      aiApp: {
        findUnique: jest.fn().mockResolvedValue(app),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...app, ...data })),
      },
      member: { findUnique: jest.fn().mockResolvedValue({ email: 'owner@pl.test', memberRoles: [] }) },
      aiAppFeedback: { findMany: jest.fn().mockResolvedValue([{ uid: 'f1' }, { uid: 'f2' }]) },
      feedbackLinearIssue: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    };
    aiApps = { isCreatorOrDirectoryAdmin: jest.fn().mockResolvedValue(true) };
    linear = {
      teams: jest.fn().mockResolvedValue(TEAMS),
      team: jest.fn().mockResolvedValue({ ...TEAMS[0], triageEnabled: false, states: [], labels: [] }),
      userByEmail: jest.fn().mockResolvedValue({ id: 'u1', teamIds: ['tA', 'tC'] }),
    };
    service = new AiAppsLinearService(prisma as never, aiApps as never, linear as never);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('listTeams', () => {
    it("lists only the requester's own private teams, with projects", async () => {
      await expect(service.listTeams('owner')).resolves.toEqual([
        { id: 'tA', key: 'ALP', name: 'Alpha', projects: [{ id: 'pA', name: 'Roadmap' }] },
      ]);
      expect(linear.userByEmail).toHaveBeenCalledWith('owner@pl.test');
    });

    it('returns [] when the requester has no Linear account', async () => {
      linear.userByEmail.mockResolvedValue(null);
      await expect(service.listTeams('owner')).resolves.toEqual([]);
    });

    it('returns [] when the requester has no email', async () => {
      prisma.member.findUnique.mockResolvedValue({ email: null, memberRoles: [] });
      await expect(service.listTeams('owner')).resolves.toEqual([]);
      expect(linear.userByEmail).not.toHaveBeenCalled();
    });

    it('lists every private team, sorted by name, for a directory admin', async () => {
      prisma.member.findUnique.mockResolvedValue({ email: 'admin@pl.test', memberRoles: ADMIN_ROLES });
      const teams = await service.listTeams('admin');
      expect(teams.map((team) => team.id)).toEqual(['tA', 'tB', 'tD']);
      expect(linear.userByEmail).not.toHaveBeenCalled();
    });

    it('is 503 when Linear is not configured', async () => {
      delete process.env.FEEDBACK_LINEAR_CLIENT_SECRET;
      await expect(service.listTeams('owner')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('getTarget', () => {
    it('returns the stored target', async () => {
      const setAt = new Date('2026-10-15T00:00:00Z');
      prisma.aiApp.findUnique.mockResolvedValue({
        ...app,
        linearTeamId: 'tA',
        linearProjectId: 'pA',
        linearTargetSetAt: setAt,
      });
      await expect(service.getTarget('owner', 'app1')).resolves.toEqual({ teamId: 'tA', projectId: 'pA', setAt });
    });

    it('returns nulls when no target is set', async () => {
      await expect(service.getTarget('owner', 'app1')).resolves.toEqual({ teamId: null, projectId: null, setAt: null });
    });

    it('is 403 for someone who is neither the creator nor an admin', async () => {
      aiApps.isCreatorOrDirectoryAdmin.mockResolvedValue(false);
      await expect(service.getTarget('other', 'app1')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('is 404 for a missing or deleted app', async () => {
      prisma.aiApp.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...app, status: 'DELETED' });
      await expect(service.getTarget('owner', 'nope')).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getTarget('owner', 'app1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('is 503 when Linear is not configured', async () => {
      delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
      await expect(service.getTarget('owner', 'app1')).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
  });

  describe('updateTarget', () => {
    it('saves a private team and project with the time it was set', async () => {
      const result = await service.updateTarget('owner', 'app1', { teamId: 'tA', projectId: 'pA' });
      const { data } = prisma.aiApp.update.mock.calls[0][0];
      expect(data).toMatchObject({ linearTeamId: 'tA', linearProjectId: 'pA' });
      expect(data.linearTargetSetAt).toBeInstanceOf(Date);
      expect(result).toEqual({ teamId: 'tA', projectId: 'pA', setAt: data.linearTargetSetAt });
    });

    it('saves a team without a project', async () => {
      await service.updateTarget('owner', 'app1', { teamId: 'tA' });
      expect(prisma.aiApp.update.mock.calls[0][0].data).toMatchObject({ linearTeamId: 'tA', linearProjectId: null });
    });

    it("re-queues the app's FAILED pushes with attempts reset, keeping their team", async () => {
      await service.updateTarget('owner', 'app1', { teamId: 'tA' });
      const { where, data } = prisma.feedbackLinearIssue.updateMany.mock.calls[0][0];
      expect(where).toEqual({ sourceType: 'AI_APP_FEEDBACK', sourceUid: { in: ['f1', 'f2'] }, status: 'FAILED' });
      expect(data).toMatchObject({ status: 'PENDING', attempts: 0, leaseUntil: null });
      expect(data).not.toHaveProperty('teamId');
    });

    it('clears the target with teamId null without calling Linear', async () => {
      const result = await service.updateTarget('owner', 'app1', { teamId: null });
      expect(linear.team).not.toHaveBeenCalled();
      expect(prisma.aiApp.update.mock.calls[0][0].data).toEqual({
        linearTeamId: null,
        linearProjectId: null,
        linearTargetSetAt: null,
      });
      expect(result).toEqual({ teamId: null, projectId: null, setAt: null });
      expect(prisma.feedbackLinearIssue.updateMany).not.toHaveBeenCalled();
    });

    it('is 400 for a public team, saving nothing', async () => {
      linear.team.mockResolvedValue({ ...TEAMS[2], triageEnabled: false, states: [], labels: [] });
      const error = await service.updateTarget('owner', 'app1', { teamId: 'tC' }).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('tC');
      expect(prisma.aiApp.update).not.toHaveBeenCalled();
    });

    it('is 400 naming an unknown team', async () => {
      linear.team.mockResolvedValue(null);
      const error = await service.updateTarget('owner', 'app1', { teamId: 'nope' }).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('nope');
    });

    it('is 400 naming a project outside the team', async () => {
      const error = await service.updateTarget('owner', 'app1', { teamId: 'tA', projectId: 'pX' }).catch((e) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('pX');
      expect(prisma.aiApp.update).not.toHaveBeenCalled();
    });

    it('is 403 for a non-manager before calling Linear', async () => {
      aiApps.isCreatorOrDirectoryAdmin.mockResolvedValue(false);
      await expect(service.updateTarget('other', 'app1', { teamId: 'tA' })).rejects.toBeInstanceOf(ForbiddenException);
      expect(linear.team).not.toHaveBeenCalled();
    });

    it('is 503 when Linear is not configured', async () => {
      delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
      await expect(service.updateTarget('owner', 'app1', { teamId: 'tA' })).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
    });
  });
});

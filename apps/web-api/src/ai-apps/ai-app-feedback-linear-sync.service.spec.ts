// Factories keep Jest away from axios's ESM build and the AiAppsService import chain.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('../feedback-linear/feedback-linear-outbox.service', () => ({ FeedbackLinearOutboxService: jest.fn() }));

import { AiAppFeedbackLinearSync } from './ai-app-feedback-linear-sync.service';
import { AiAppsService } from './ai-apps.service';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo', name: 'Ops Board', access: 'OPEN', status: 'READY' };

describe('AiAppFeedbackLinearSync', () => {
  const saved: Record<string, string | undefined> = {};
  let outbox: { enqueue: jest.Mock; requestState: jest.Mock };
  let sync: AiAppFeedbackLinearSync;
  const KEYS = [
    'FEEDBACK_LINEAR_CLIENT_ID',
    'FEEDBACK_LINEAR_CLIENT_SECRET',
    'FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID',
    'FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID',
  ];

  beforeEach(() => {
    for (const key of KEYS) saved[key] = process.env[key];
    process.env.FEEDBACK_LINEAR_CLIENT_ID = 'cid';
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = 'secret';
    process.env.FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID = 'team-1';
    process.env.FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID = 'proj-1';
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined), requestState: jest.fn().mockResolvedValue(true) };
    sync = new AiAppFeedbackLinearSync(outbox as never);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('onSubmitted', () => {
    it('queues every private feedback item for the member-apps team and project', async () => {
      await sync.onSubmitted({ uid: 'fb-1', kind: 'FEEDBACK' });
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledWith({
        sourceType: 'AI_APP_FEEDBACK',
        sourceUid: 'fb-1',
        teamId: 'team-1',
        projectId: 'proj-1',
      });
    });

    it('queues with no project when none is configured', async () => {
      delete process.env.FEEDBACK_LINEAR_MEMBER_APPS_PROJECT_ID;
      await sync.onSubmitted({ uid: 'fb-1', kind: 'FEEDBACK' });
      expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({ teamId: 'team-1', projectId: null }));
    });

    it('never queues a COMMENT', async () => {
      await sync.onSubmitted({ uid: 'c-1', kind: 'COMMENT' });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('never queues without a member-apps team', async () => {
      delete process.env.FEEDBACK_LINEAR_MEMBER_APPS_TEAM_ID;
      await sync.onSubmitted({ uid: 'fb-1', kind: 'FEEDBACK' });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('never queues without Linear credentials', async () => {
      delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
      await sync.onSubmitted({ uid: 'fb-1', kind: 'FEEDBACK' });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('swallows an outbox error', async () => {
      outbox.enqueue.mockRejectedValue(new Error('db down'));
      await expect(sync.onSubmitted({ uid: 'fb-1', kind: 'FEEDBACK' })).resolves.toBeUndefined();
    });
  });

  describe('onStatusChanged', () => {
    it.each([
      ['NEW', 'VIEWED', null],
      ['VIEWED', 'NEW', null],
      ['NEW', 'IMPLEMENTED', 'COMPLETED'],
      ['VIEWED', 'IMPLEMENTED', 'COMPLETED'],
      ['IMPLEMENTED', 'NEW', 'INTAKE'],
      ['IMPLEMENTED', 'VIEWED', 'INTAKE'],
      ['IMPLEMENTED', 'IMPLEMENTED', null],
    ])('%s → %s requests %s', async (from, to, target) => {
      await sync.onStatusChanged('fb-1', from as never, to as never);
      if (target) {
        expect(outbox.requestState).toHaveBeenCalledWith('AI_APP_FEEDBACK', 'fb-1', target, undefined);
      } else {
        expect(outbox.requestState).not.toHaveBeenCalled();
      }
    });

    it('swallows an outbox error', async () => {
      outbox.requestState.mockRejectedValue(new Error('db down'));
      await expect(sync.onStatusChanged('fb-1', 'NEW', 'IMPLEMENTED')).resolves.toBeUndefined();
    });
  });

  it('turns a closing note into a pending comment on a completed issue', async () => {
    await sync.onClosingNote('fb-1', 'note-1');
    expect(outbox.requestState).toHaveBeenCalledWith('AI_APP_FEEDBACK', 'fb-1', 'COMPLETED', { uid: 'note-1' });
  });

  it('cancels on delete', async () => {
    await sync.onDeleted('fb-1');
    expect(outbox.requestState).toHaveBeenCalledWith('AI_APP_FEEDBACK', 'fb-1', 'CANCELED', undefined);
  });
});

describe('AiAppsService → Linear sync hooks', () => {
  const FEEDBACK = {
    uid: 'fb-1',
    appUid: 'app-1',
    memberUid: 'member-1',
    text: '<p>hi</p>',
    status: 'NEW',
    kind: 'FEEDBACK',
    createdAt: new Date('2026-10-15T12:00:00Z'),
  };

  function build(syncOverrides: Record<string, jest.Mock> = {}) {
    const prisma = {
      aiApp: {
        findUnique: jest.fn().mockResolvedValue(APP),
        findMany: jest.fn().mockResolvedValue([{ uid: 'app-1', name: 'Ops Board' }]),
      },
      aiAppFeedback: {
        create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...FEEDBACK, ...data })),
        findMany: jest.fn().mockResolvedValue([{ ...FEEDBACK, pins: [], _count: { comments: 0, pins: 0 } }]),
        findUnique: jest.fn().mockResolvedValue(FEEDBACK),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...FEEDBACK, ...data })),
        delete: jest.fn().mockResolvedValue(FEEDBACK),
      },
      aiAppFeedbackComment: {
        create: jest.fn().mockResolvedValue({ uid: 'note-1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      member: {
        findMany: jest.fn().mockResolvedValue([]),
        findUnique: jest.fn().mockResolvedValue({ memberRoles: [] }),
      },
    };
    const sync = {
      onSubmitted: jest.fn().mockResolvedValue(undefined),
      onStatusChanged: jest.fn().mockResolvedValue(undefined),
      onClosingNote: jest.fn().mockResolvedValue(undefined),
      onDeleted: jest.fn().mockResolvedValue(undefined),
      ...syncOverrides,
    };
    const service = new AiAppsService(
      prisma as any,
      {} as any,
      { create: jest.fn() } as any,
      { trackEvent: jest.fn() } as any,
      undefined,
      sync as any
    );
    return { service, prisma, sync };
  }

  it('hands each submission to the sync with the app and the created row', async () => {
    const { service, sync } = build();
    await service.submitFeedback('member-1', 'app-1', '<p>hi</p>');
    expect(sync.onSubmitted).toHaveBeenCalledWith(expect.objectContaining({ uid: 'fb-1', kind: 'FEEDBACK' }));
  });

  it('reports every status change with its previous status', async () => {
    const { service, sync } = build();
    await service.updateFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED');
    expect(sync.onStatusChanged).toHaveBeenCalledWith('fb-1', 'NEW', 'IMPLEMENTED');
  });

  it("reports the agent's closing note after the status change", async () => {
    const { service, prisma, sync } = build();
    prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...FEEDBACK, _count: { pins: 0 } });
    await service.updateAgentFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED', undefined, 'Fixed in v2');
    expect(sync.onStatusChanged).toHaveBeenCalledWith('fb-1', 'NEW', 'IMPLEMENTED');
    expect(sync.onClosingNote).toHaveBeenCalledWith('fb-1', 'note-1');
  });

  it('reports a deleted item', async () => {
    const { service, sync } = build();
    await service.deleteFeedbackItem('member-1', 'app-1', 'fb-1');
    expect(sync.onDeleted).toHaveBeenCalledWith('fb-1');
  });

  it('adds nothing to any feedback list: Linear is invisible in LabOS', async () => {
    const { service } = build();
    const own = await service.listFeedback('creator-1', 'app-1');
    const all = await service.listAccessibleFeedback('creator-1');
    const mine = await service.listMyFeedback('member-1');
    for (const rows of [own, all, mine]) {
      expect(rows[0]).not.toHaveProperty('linearIssue');
    }
  });
});

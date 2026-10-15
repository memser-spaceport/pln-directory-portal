// Factories keep Jest away from axios's ESM build and the AiAppsService import chain.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false), create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../feedback-linear/feedback-linear-outbox.service', () => ({ FeedbackLinearOutboxService: jest.fn() }));

import { AiAppFeedbackLinearSync } from './ai-app-feedback-linear-sync.service';
import { AiAppsService } from './ai-apps.service';

const TARGET_SET_AT = new Date('2026-10-15T10:00:00Z');
const APP = {
  uid: 'app-1',
  memberUid: 'creator-1',
  appId: 'demo',
  name: 'Ops Board',
  access: 'OPEN',
  status: 'READY',
  linearTeamId: 'team-1',
  linearProjectId: 'proj-1',
  linearTargetSetAt: TARGET_SET_AT,
};

describe('AiAppFeedbackLinearSync', () => {
  const saved: Record<string, string | undefined> = {};
  let outbox: { enqueue: jest.Mock; requestState: jest.Mock };
  let prisma: { feedbackLinearIssue: { findMany: jest.Mock } };
  let sync: AiAppFeedbackLinearSync;

  const after = new Date(TARGET_SET_AT.getTime() + 1000);

  beforeEach(() => {
    for (const key of ['FEEDBACK_LINEAR_CLIENT_ID', 'FEEDBACK_LINEAR_CLIENT_SECRET']) saved[key] = process.env[key];
    process.env.FEEDBACK_LINEAR_CLIENT_ID = 'cid';
    process.env.FEEDBACK_LINEAR_CLIENT_SECRET = 'secret';
    outbox = { enqueue: jest.fn().mockResolvedValue(undefined), requestState: jest.fn().mockResolvedValue(true) };
    prisma = { feedbackLinearIssue: { findMany: jest.fn().mockResolvedValue([]) } };
    sync = new AiAppFeedbackLinearSync(outbox as never, prisma as never);
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  describe('onSubmitted', () => {
    it('queues private feedback created after the target, frozen to the app target', async () => {
      await sync.onSubmitted(APP as never, { uid: 'fb-1', kind: 'FEEDBACK', createdAt: after });
      expect(outbox.enqueue).toHaveBeenCalledTimes(1);
      expect(outbox.enqueue).toHaveBeenCalledWith({
        sourceType: 'AI_APP_FEEDBACK',
        sourceUid: 'fb-1',
        teamId: 'team-1',
        projectId: 'proj-1',
      });
    });

    it('never queues a COMMENT', async () => {
      await sync.onSubmitted(APP as never, { uid: 'c-1', kind: 'COMMENT', createdAt: after });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('never queues on an app without a target', async () => {
      await sync.onSubmitted({ ...APP, linearTeamId: null, linearTargetSetAt: null } as never, {
        uid: 'fb-1',
        kind: 'FEEDBACK',
        createdAt: after,
      });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('never queues an item created before the target was set', async () => {
      await sync.onSubmitted(APP as never, {
        uid: 'fb-1',
        kind: 'FEEDBACK',
        createdAt: new Date(TARGET_SET_AT.getTime() - 1),
      });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('never queues without Linear credentials', async () => {
      delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
      await sync.onSubmitted(APP as never, { uid: 'fb-1', kind: 'FEEDBACK', createdAt: after });
      expect(outbox.enqueue).not.toHaveBeenCalled();
    });

    it('swallows an outbox error', async () => {
      outbox.enqueue.mockRejectedValue(new Error('db down'));
      await expect(
        sync.onSubmitted(APP as never, { uid: 'fb-1', kind: 'FEEDBACK', createdAt: after })
      ).resolves.toBeUndefined();
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

  describe('attach', () => {
    it('maps synced, pending and absent rows', async () => {
      prisma.feedbackLinearIssue.findMany.mockResolvedValue([
        { sourceUid: 'a', status: 'SYNCED', identifier: 'ABC-12', url: 'https://linear.app/x/ABC-12', lastError: null },
        { sourceUid: 'b', status: 'PENDING', identifier: null, url: null, lastError: 'Linear responded 503' },
      ]);
      const rows = await sync.attach([{ uid: 'a' }, { uid: 'b' }, { uid: 'c' }]);
      expect(rows).toEqual([
        {
          uid: 'a',
          linearIssue: { status: 'SYNCED', identifier: 'ABC-12', url: 'https://linear.app/x/ABC-12', lastError: null },
        },
        {
          uid: 'b',
          linearIssue: { status: 'PENDING', identifier: null, url: null, lastError: 'Linear responded 503' },
        },
        { uid: 'c', linearIssue: null },
      ]);
      expect(prisma.feedbackLinearIssue.findMany.mock.calls[0][0].where).toEqual({
        sourceType: 'AI_APP_FEEDBACK',
        sourceUid: { in: ['a', 'b', 'c'] },
      });
    });

    it('returns null issues when the lookup fails', async () => {
      prisma.feedbackLinearIssue.findMany.mockRejectedValue(new Error('db down'));
      await expect(sync.attach([{ uid: 'a' }])).resolves.toEqual([{ uid: 'a', linearIssue: null }]);
    });

    it('skips the query for no rows', async () => {
      await expect(sync.attach([])).resolves.toEqual([]);
      expect(prisma.feedbackLinearIssue.findMany).not.toHaveBeenCalled();
    });
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
      attach: jest.fn().mockImplementation((rows) => rows.map((row) => ({ ...row, linearIssue: null }))),
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
    expect(sync.onSubmitted).toHaveBeenCalledWith(APP, expect.objectContaining({ uid: 'fb-1', kind: 'FEEDBACK' }));
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

  it('attaches linearIssue to the owner list and the cross-app review list', async () => {
    const { service } = build();
    const own = await service.listFeedback('creator-1', 'app-1');
    expect(own[0]).toHaveProperty('linearIssue', null);
    const all = await service.listAccessibleFeedback('creator-1');
    expect(all[0]).toHaveProperty('linearIssue', null);
  });

  it("never attaches linearIssue to the reporter's own list", async () => {
    const { service, sync } = build();
    const mine = await service.listMyFeedback('member-1');
    expect(mine[0]).not.toHaveProperty('linearIssue');
    expect(sync.attach).not.toHaveBeenCalled();
  });
});

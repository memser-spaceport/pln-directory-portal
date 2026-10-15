import { FeedbackLinearIssue } from '@prisma/client';
import { FeedbackLinearHandlerRegistry, FeedbackLinearPermanentError } from './feedback-linear-handlers';
import { FeedbackLinearWorker } from './feedback-linear.worker';
import { LinearApiError } from './linear.client';

// Factories keep Jest from loading axios's ESM build (directly and via posthog-node).
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn() })) }));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn() })),
}));

const ENV = {
  FEEDBACK_LINEAR_CLIENT_ID: 'cid',
  FEEDBACK_LINEAR_CLIENT_SECRET: 'secret',
  FEEDBACK_LINEAR_PLATFORM_TEAM_ID: 'team',
  FEEDBACK_LINEAR_PLATFORM_STATE_ID: 'state',
  FEEDBACK_LINEAR_MAX_ATTEMPTS: '8',
};

describe('FeedbackLinearWorker', () => {
  const saved: Record<string, string | undefined> = {};
  let outbox: {
    claimDue: jest.Mock;
    saveProgress: jest.Mock;
    markSynced: jest.Mock;
    markSkipped: jest.Mock;
    markFailedAttempt: jest.Mock;
  };
  let linear: { issueById: jest.Mock; issueCreate: jest.Mock; issueUpdate: jest.Mock; commentCreate: jest.Mock };
  let teamMeta: { intakeStateId: jest.Mock; stateIdOfType: jest.Mock };
  let analytics: { trackEvent: jest.Mock };
  let registry: FeedbackLinearHandlerRegistry;
  let buildIssue: jest.Mock;
  let buildComment: jest.Mock;
  let worker: FeedbackLinearWorker;

  const draft = { teamId: 'team', title: '[Feedback] Hi', description: 'body', stateId: 'intake-state' };
  const issue = { id: 'lid', identifier: 'LAB-1', url: 'https://linear.app/i/LAB-1' };
  const createdProgress = {
    identifier: 'LAB-1',
    url: 'https://linear.app/i/LAB-1',
    appliedState: 'INTAKE',
    intakeStateId: 'intake-state',
  };

  function row(overrides: Partial<FeedbackLinearIssue> = {}): FeedbackLinearIssue {
    const now = new Date();
    return {
      id: 1,
      uid: 'r1',
      sourceType: 'CONTACT_SUPPORT',
      sourceUid: 'cs1',
      teamId: 'team',
      projectId: null,
      linearIssueId: 'lid',
      status: 'PENDING',
      attempts: 0,
      nextAttemptAt: now,
      leaseUntil: null,
      identifier: null,
      url: null,
      lastError: null,
      targetState: 'INTAKE',
      appliedState: null,
      intakeStateId: null,
      pendingCommentUid: null,
      pendingCommentId: null,
      version: 0,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  /** A row whose issue already exists in its intake state. */
  function synced(overrides: Partial<FeedbackLinearIssue> = {}): FeedbackLinearIssue {
    return row({
      sourceType: 'AI_APP_FEEDBACK',
      identifier: 'LAB-1',
      url: issue.url,
      appliedState: 'INTAKE',
      intakeStateId: 'intake-state',
      ...overrides,
    });
  }

  function newWorker() {
    return new FeedbackLinearWorker(outbox as never, registry, linear as never, teamMeta as never, analytics as never);
  }

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    outbox = {
      claimDue: jest.fn().mockResolvedValue([]),
      saveProgress: jest.fn().mockResolvedValue(undefined),
      markSynced: jest.fn().mockResolvedValue(undefined),
      markSkipped: jest.fn().mockResolvedValue(undefined),
      markFailedAttempt: jest.fn().mockResolvedValue('PENDING'),
    };
    linear = {
      issueById: jest.fn().mockResolvedValue(null),
      issueCreate: jest.fn().mockResolvedValue(issue),
      issueUpdate: jest.fn().mockResolvedValue(undefined),
      commentCreate: jest.fn().mockResolvedValue(undefined),
    };
    teamMeta = {
      intakeStateId: jest.fn().mockResolvedValue('team-intake'),
      stateIdOfType: jest.fn().mockImplementation((_team, type) => Promise.resolve(`${type}-state`)),
    };
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    registry = new FeedbackLinearHandlerRegistry();
    buildIssue = jest.fn().mockResolvedValue(draft);
    buildComment = jest.fn().mockResolvedValue('Closing note from LabOS: Fixed');
    registry.register({ sourceType: 'CONTACT_SUPPORT', buildIssue });
    registry.register({ sourceType: 'AI_APP_FEEDBACK', buildIssue, buildComment });
    worker = newWorker();
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('does nothing when Linear credentials are not configured', async () => {
    delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
    await worker.tick();
    expect(outbox.claimDue).not.toHaveBeenCalled();
  });

  it('runs on credentials alone, without the platform team', async () => {
    delete process.env.FEEDBACK_LINEAR_PLATFORM_TEAM_ID;
    delete process.env.FEEDBACK_LINEAR_PLATFORM_STATE_ID;
    await worker.tick();
    expect(outbox.claimDue).toHaveBeenCalledTimes(1);
  });

  it('runs one tick at a time in a process', async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<FeedbackLinearIssue[]>((resolve) => {
      release = () => resolve([]);
    });
    outbox.claimDue.mockReturnValueOnce(pending);
    const first = worker.tick();
    await worker.tick();
    release();
    await first;
    expect(outbox.claimDue).toHaveBeenCalledTimes(1);
  });

  describe('creating the issue', () => {
    it('creates it under the row id, saves the progress at once and marks the row synced', async () => {
      outbox.claimDue.mockResolvedValue([row()]);
      await worker.tick();
      expect(linear.issueById).not.toHaveBeenCalled();
      expect(linear.issueCreate).toHaveBeenCalledWith({ ...draft, id: 'lid' });
      expect(outbox.saveProgress).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), createdProgress);
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), createdProgress);
      expect(linear.issueUpdate).not.toHaveBeenCalled();
    });

    it('on a retry, reuses an issue Linear already created instead of creating another', async () => {
      outbox.claimDue.mockResolvedValue([row({ attempts: 1 })]);
      linear.issueById.mockResolvedValue(issue);
      await worker.tick();
      expect(linear.issueCreate).not.toHaveBeenCalled();
      expect(buildIssue).not.toHaveBeenCalled();
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), {
        identifier: 'LAB-1',
        url: issue.url,
        appliedState: 'INTAKE',
      });
    });

    it('timeout then retry makes exactly one issueCreate call and ends synced', async () => {
      linear.issueCreate.mockRejectedValueOnce(
        new LinearApiError('Linear request failed: ECONNABORTED', 0, null, true)
      );
      outbox.claimDue.mockResolvedValueOnce([row()]);
      await worker.tick();
      expect(outbox.markFailedAttempt).toHaveBeenCalledTimes(1);

      // Linear had committed the first create; the retry finds it by id.
      linear.issueById.mockResolvedValueOnce(issue);
      outbox.claimDue.mockResolvedValueOnce([row({ attempts: 1 })]);
      await worker.tick();

      expect(linear.issueCreate).toHaveBeenCalledTimes(1);
      expect(outbox.markSynced).toHaveBeenCalledTimes(1);
    });

    it('treats "already exists" on create as success', async () => {
      outbox.claimDue.mockResolvedValue([row()]);
      linear.issueCreate.mockRejectedValue(new LinearApiError('Entity already exists', 400, null, false));
      linear.issueById.mockResolvedValue(issue);
      await worker.tick();
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), createdProgress);
      expect(outbox.markFailedAttempt).not.toHaveBeenCalled();
    });
  });

  describe('state changes', () => {
    it('creates then completes in one tick when the item was implemented before its push', async () => {
      outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK', targetState: 'COMPLETED' })]);
      await worker.tick();
      expect(linear.issueCreate).toHaveBeenCalledTimes(1);
      expect(teamMeta.stateIdOfType).toHaveBeenCalledWith('team', 'completed');
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'completed-state' });
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), {
        ...createdProgress,
        appliedState: 'COMPLETED',
      });
    });

    it('moves a synced issue to completed and posts the pending comment under its stored id', async () => {
      outbox.claimDue.mockResolvedValue([
        synced({ targetState: 'COMPLETED', pendingCommentUid: 'note1', pendingCommentId: 'comment-uuid' }),
      ]);
      await worker.tick();
      expect(linear.issueCreate).not.toHaveBeenCalled();
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'completed-state' });
      expect(buildComment).toHaveBeenCalledWith(expect.anything(), 'note1');
      expect(linear.commentCreate).toHaveBeenCalledWith({
        id: 'comment-uuid',
        issueId: 'lid',
        body: 'Closing note from LabOS: Fixed',
      });
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), {
        appliedState: 'COMPLETED',
        commentDone: true,
      });
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });

    it('posts a comment once: the retry after a timeout reuses the same comment id', async () => {
      const pendingRow = synced({
        appliedState: 'COMPLETED',
        targetState: 'COMPLETED',
        pendingCommentUid: 'n',
        pendingCommentId: 'cid1',
      });
      linear.commentCreate
        .mockRejectedValueOnce(new LinearApiError('timeout', 0, null, true))
        .mockRejectedValueOnce(new LinearApiError('Entity already exists', 400, null, false));
      outbox.claimDue.mockResolvedValueOnce([pendingRow]).mockResolvedValueOnce([{ ...pendingRow, attempts: 1 }]);

      await worker.tick();
      await worker.tick();

      expect(linear.commentCreate.mock.calls.map(([input]) => input.id)).toEqual(['cid1', 'cid1']);
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), { commentDone: true });
    });

    it('drops a pending comment whose LabOS comment is gone', async () => {
      buildComment.mockResolvedValue(null);
      outbox.claimDue.mockResolvedValue([synced({ pendingCommentUid: 'gone', pendingCommentId: 'cid' })]);
      await worker.tick();
      expect(linear.commentCreate).not.toHaveBeenCalled();
      expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), { commentDone: true });
    });

    it('returns a reopened item to the intake state it was created in', async () => {
      outbox.claimDue.mockResolvedValue([synced({ appliedState: 'COMPLETED', targetState: 'INTAKE' })]);
      await worker.tick();
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'intake-state' });
      expect(teamMeta.intakeStateId).not.toHaveBeenCalled();
    });

    it('falls back to the team intake state when the created-in state is unknown', async () => {
      outbox.claimDue.mockResolvedValue([
        synced({ appliedState: 'COMPLETED', targetState: 'INTAKE', intakeStateId: null }),
      ]);
      await worker.tick();
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'team-intake' });
    });

    it('cancels the issue of a deleted item', async () => {
      outbox.claimDue.mockResolvedValue([synced({ targetState: 'CANCELED' })]);
      await worker.tick();
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'canceled-state' });
    });

    it('skips an item deleted before its issue was created', async () => {
      outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK', targetState: 'CANCELED' })]);
      await worker.tick();
      expect(linear.issueCreate).not.toHaveBeenCalled();
      expect(outbox.markSkipped).toHaveBeenCalledTimes(1);
      expect(outbox.markSynced).not.toHaveBeenCalled();
    });

    it('cancels instead of skipping when a retry finds the issue was created after all', async () => {
      outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK', targetState: 'CANCELED', attempts: 1 })]);
      linear.issueById.mockResolvedValue(issue);
      await worker.tick();
      expect(outbox.markSkipped).not.toHaveBeenCalled();
      expect(linear.issueUpdate).toHaveBeenCalledWith('lid', { stateId: 'canceled-state' });
    });

    it('keeps the created issue when the state change then fails', async () => {
      outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK', targetState: 'COMPLETED' })]);
      linear.issueUpdate.mockRejectedValue(new LinearApiError('down', 503, null, true));
      await worker.tick();
      expect(outbox.saveProgress).toHaveBeenCalledWith(expect.anything(), createdProgress);
      expect(outbox.markFailedAttempt).toHaveBeenCalledTimes(1);
    });
  });

  describe('failures', () => {
    it('records a failed attempt with the configured max and Linear wait time', async () => {
      outbox.claimDue.mockResolvedValue([row({ attempts: 2 })]);
      linear.issueCreate.mockRejectedValue(new LinearApiError('Rate limited', 429, 'RATELIMITED', true, 60_000));
      await worker.tick();
      expect(outbox.markFailedAttempt).toHaveBeenCalledWith(expect.anything(), 'Rate limited', 8, 60_000);
    });

    it('fails a push for an unknown source type at once', async () => {
      registry = new FeedbackLinearHandlerRegistry();
      worker = newWorker();
      outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK' })]);
      await worker.tick();
      expect(outbox.markFailedAttempt).toHaveBeenCalledWith(
        expect.anything(),
        'No handler for source type AI_APP_FEEDBACK',
        1,
        null
      );
    });

    it('fails a push at once on a permanent handler error', async () => {
      outbox.claimDue.mockResolvedValue([row({ attempts: 3 })]);
      buildIssue.mockRejectedValue(new FeedbackLinearPermanentError('Contact support request cs1 not found'));
      await worker.tick();
      expect(outbox.markFailedAttempt).toHaveBeenCalledWith(
        expect.anything(),
        'Contact support request cs1 not found',
        4,
        null
      );
    });

    it('keeps going after one row fails', async () => {
      outbox.claimDue.mockResolvedValue([row({ id: 1 }), row({ id: 2, uid: 'r2', linearIssueId: 'lid2' })]);
      linear.issueCreate
        .mockRejectedValueOnce(new LinearApiError('boom', 500, null, true))
        .mockResolvedValueOnce(issue);
      await worker.tick();
      expect(outbox.markFailedAttempt).toHaveBeenCalledTimes(1);
      expect(outbox.markSynced).toHaveBeenCalledTimes(1);
    });
  });

  describe('analytics', () => {
    it('tracks a pushed event without email or feedback text', async () => {
      outbox.claimDue.mockResolvedValue([row()]);
      await worker.tick();
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: 'feedback-linear-pushed',
        distinctId: 'feedback-linear-worker',
        properties: { sourceType: 'CONTACT_SUPPORT', attempts: 1, teamId: 'team' },
      });
      const { properties } = analytics.trackEvent.mock.calls[0][0];
      expect(Object.keys(properties)).not.toEqual(expect.arrayContaining(['email']));
      expect(Object.keys(properties)).not.toEqual(expect.arrayContaining(['text']));
    });

    it('tracks a failed event only when the push becomes FAILED', async () => {
      outbox.claimDue.mockResolvedValue([row({ attempts: 7 })]);
      linear.issueCreate.mockRejectedValue(new LinearApiError('down', 503, null, true));
      outbox.markFailedAttempt.mockResolvedValueOnce('FAILED');
      await worker.tick();
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: 'feedback-linear-failed',
        distinctId: 'feedback-linear-worker',
        properties: { sourceType: 'CONTACT_SUPPORT', attempts: 8, teamId: 'team' },
      });
    });

    it('tracks nothing for a failure that will be retried, or one overtaken by a newer request', async () => {
      outbox.claimDue.mockResolvedValue([row()]);
      linear.issueCreate.mockRejectedValue(new LinearApiError('down', 503, null, true));
      outbox.markFailedAttempt.mockResolvedValueOnce('PENDING').mockResolvedValueOnce(null);
      await worker.tick();
      await worker.tick();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });
  });
});

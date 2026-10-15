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
  let outbox: { claimDue: jest.Mock; markSynced: jest.Mock; markFailedAttempt: jest.Mock };
  let linear: { issueById: jest.Mock; issueCreate: jest.Mock };
  let analytics: { trackEvent: jest.Mock };
  let registry: FeedbackLinearHandlerRegistry;
  let buildIssue: jest.Mock;
  let worker: FeedbackLinearWorker;

  const draft = { teamId: 'team', title: '[Feedback] Hi', description: 'body', stateId: 'state' };
  const issue = { id: 'lid', identifier: 'LAB-1', url: 'https://linear.app/i/LAB-1' };

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
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    outbox = {
      claimDue: jest.fn().mockResolvedValue([]),
      markSynced: jest.fn().mockResolvedValue(undefined),
      markFailedAttempt: jest.fn().mockResolvedValue('PENDING'),
    };
    linear = { issueById: jest.fn().mockResolvedValue(null), issueCreate: jest.fn().mockResolvedValue(issue) };
    analytics = { trackEvent: jest.fn().mockResolvedValue(undefined) };
    registry = new FeedbackLinearHandlerRegistry();
    buildIssue = jest.fn().mockResolvedValue(draft);
    registry.register({ sourceType: 'CONTACT_SUPPORT', buildIssue });
    worker = new FeedbackLinearWorker(outbox as never, registry, linear as never, analytics as never);
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('does nothing when Linear is not configured', async () => {
    delete process.env.FEEDBACK_LINEAR_CLIENT_ID;
    await worker.tick();
    expect(outbox.claimDue).not.toHaveBeenCalled();
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

  it('creates the issue under the row id and marks it synced', async () => {
    outbox.claimDue.mockResolvedValue([row()]);
    await worker.tick();
    expect(linear.issueById).not.toHaveBeenCalled();
    expect(linear.issueCreate).toHaveBeenCalledWith({ ...draft, id: 'lid' });
    expect(outbox.markSynced).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), issue);
  });

  it('on a retry, reuses an issue Linear already created instead of creating another', async () => {
    outbox.claimDue.mockResolvedValue([row({ attempts: 1 })]);
    linear.issueById.mockResolvedValue(issue);
    await worker.tick();
    expect(linear.issueCreate).not.toHaveBeenCalled();
    expect(buildIssue).not.toHaveBeenCalled();
    expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), issue);
  });

  it('timeout then retry makes exactly one issueCreate call and ends synced', async () => {
    linear.issueCreate.mockRejectedValueOnce(new LinearApiError('Linear request failed: ECONNABORTED', 0, null, true));
    outbox.claimDue.mockResolvedValueOnce([row()]);
    await worker.tick();
    expect(outbox.markFailedAttempt).toHaveBeenCalledTimes(1);

    // Linear had committed the first create; the retry finds it by id.
    linear.issueById.mockResolvedValueOnce(issue);
    outbox.claimDue.mockResolvedValueOnce([row({ attempts: 1 })]);
    await worker.tick();

    expect(linear.issueCreate).toHaveBeenCalledTimes(1);
    expect(outbox.markSynced).toHaveBeenCalledWith(expect.objectContaining({ attempts: 1 }), issue);
  });

  it('treats "already exists" on create as success', async () => {
    outbox.claimDue.mockResolvedValue([row()]);
    linear.issueCreate.mockRejectedValue(new LinearApiError('Entity already exists', 400, null, false));
    linear.issueById.mockResolvedValue(issue);
    await worker.tick();
    expect(outbox.markSynced).toHaveBeenCalledWith(expect.anything(), issue);
    expect(outbox.markFailedAttempt).not.toHaveBeenCalled();
  });

  it('records a failed attempt with the configured max and Linear wait time', async () => {
    outbox.claimDue.mockResolvedValue([row({ attempts: 2 })]);
    linear.issueCreate.mockRejectedValue(new LinearApiError('Rate limited', 429, 'RATELIMITED', true, 60_000));
    await worker.tick();
    expect(outbox.markFailedAttempt).toHaveBeenCalledWith(expect.anything(), 'Rate limited', 8, 60_000);
  });

  it('fails a push for an unknown source type at once', async () => {
    outbox.claimDue.mockResolvedValue([row({ sourceType: 'AI_APP_FEEDBACK', attempts: 0 })]);
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
    linear.issueCreate.mockRejectedValueOnce(new LinearApiError('boom', 500, null, true)).mockResolvedValueOnce(issue);
    await worker.tick();
    expect(outbox.markFailedAttempt).toHaveBeenCalledTimes(1);
    expect(outbox.markSynced).toHaveBeenCalledTimes(1);
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
      linear.issueById.mockResolvedValue(null);
      linear.issueCreate.mockRejectedValue(new LinearApiError('down', 503, null, true));
      outbox.markFailedAttempt.mockResolvedValueOnce('FAILED');
      await worker.tick();
      expect(analytics.trackEvent).toHaveBeenCalledWith({
        name: 'feedback-linear-failed',
        distinctId: 'feedback-linear-worker',
        properties: { sourceType: 'CONTACT_SUPPORT', attempts: 8, teamId: 'team' },
      });
    });

    it('tracks nothing for a failure that will be retried', async () => {
      outbox.claimDue.mockResolvedValue([row()]);
      linear.issueCreate.mockRejectedValue(new LinearApiError('down', 503, null, true));
      await worker.tick();
      expect(analytics.trackEvent).not.toHaveBeenCalled();
    });
  });
});

import { FeedbackLinearIssue } from '@prisma/client';
import { ContactSupportLinearHandler, feedbackTypeName } from './contact-support-linear.handler';
import { feedbackIssueTitle } from './feedback-issue-text';
import { isFeedbackLinearPlatformTopic } from './feedback-linear.constants';
import { FeedbackLinearHandlerRegistry, FeedbackLinearPermanentError } from './feedback-linear-handlers';
import { LinearTeamMeta } from './linear-team-meta';

// A factory keeps Jest from loading axios's ESM build.
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn(), get: jest.fn(), put: jest.fn() })) }));

const ENV: Record<string, string> = {
  FEEDBACK_LINEAR_CLIENT_ID: 'cid',
  FEEDBACK_LINEAR_CLIENT_SECRET: 'secret',
  FEEDBACK_LINEAR_PLATFORM_TEAM_ID: 'lab-team',
  FEEDBACK_LINEAR_PLATFORM_STATE_ID: 'backlog-state',
  FEEDBACK_LINEAR_LABEL_ID: 'user-feedback-label',
  FEEDBACK_LINEAR_IMAGE_HOSTS: 'images.test',
  WEB_UI_BASE_URL: 'https://labos.test',
  ENVIRONMENT: 'production',
};

describe('contact-support → Linear issue', () => {
  const saved: Record<string, string | undefined> = {};
  let prisma: { contactSupportRequest: { findUnique: jest.Mock }; member: { findUnique: jest.Mock } };
  let images: { rehost: jest.Mock };
  let linear: { team: jest.Mock };
  let handler: ContactSupportLinearHandler;
  let registry: FeedbackLinearHandlerRegistry;

  const member = { uid: 'm1', name: 'Ada', email: 'ada_l@b.co' };

  function request(overrides: Record<string, unknown> = {}) {
    return {
      id: 1,
      uid: 'cs1',
      topic: 'Report a bug',
      email: 'ada_l@b.co',
      name: 'Ada (typed)',
      message: '<p>Search is <strong>slow</strong></p>',
      metadata: { uid: 'm1', logged: true, page: 'https://labos.test/members?q=x' },
      createdAt: new Date(),
      ...overrides,
    };
  }

  function row(overrides: Partial<FeedbackLinearIssue> = {}): FeedbackLinearIssue {
    const now = new Date();
    return {
      id: 1,
      uid: 'r1',
      sourceType: 'CONTACT_SUPPORT',
      sourceUid: 'cs1',
      teamId: 'lab-team',
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

  beforeEach(() => {
    for (const [key, value] of Object.entries(ENV)) {
      saved[key] = process.env[key];
      process.env[key] = value;
    }
    prisma = {
      contactSupportRequest: { findUnique: jest.fn().mockResolvedValue(request()) },
      member: { findUnique: jest.fn().mockResolvedValue(member) },
    };
    images = { rehost: jest.fn().mockResolvedValue([]) };
    linear = {
      team: jest.fn().mockResolvedValue({
        id: 'lab-team',
        key: 'LAB',
        name: 'LabOS',
        private: false,
        triageEnabled: false,
        states: [],
        labels: [
          { id: 'bug-label', name: 'Bug', parentName: 'Type' },
          { id: 'feature-label', name: 'Feature', parentName: 'Type' },
          { id: 'improvement-label', name: 'Improvement', parentName: 'Type' },
          { id: 'bug-severity', name: 'Bug', parentName: 'QA severity' },
        ],
        projects: [],
      }),
    };
    registry = new FeedbackLinearHandlerRegistry();
    handler = new ContactSupportLinearHandler(
      prisma as never,
      registry,
      images as never,
      new LinearTeamMeta(linear as never)
    );
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('registers itself for CONTACT_SUPPORT', () => {
    handler.onModuleInit();
    expect(registry.get('CONTACT_SUPPORT')).toBe(handler);
  });

  describe('topics', () => {
    it.each(['Give feedback', 'Share an idea', 'Report a bug', 'AI Apps Feedback'])('%s is pushed', (topic) => {
      expect(isFeedbackLinearPlatformTopic(topic)).toBe(true);
    });

    it.each(['Contact support', 'Ask a question', 'report a bug', ''])('%s is not pushed', (topic) => {
      expect(isFeedbackLinearPlatformTopic(topic)).toBe(false);
    });
  });

  describe('title', () => {
    it('uses the first line as plain text', () => {
      expect(feedbackIssueTitle('<p><strong>Search</strong> is slow</p><p>more</p>', 'Report a bug')).toBe(
        '[Feedback] Search is slow'
      );
    });

    it('cuts a long first line to 80 characters with an ellipsis', () => {
      const title = feedbackIssueTitle('x'.repeat(120), 'Give feedback');
      expect(title).toBe(`[Feedback] ${'x'.repeat(79)}…`);
    });

    it('skips empty lines', () => {
      expect(feedbackIssueTitle('<p><br></p><p>  </p><p>Real line</p>', 'Give feedback')).toBe('[Feedback] Real line');
    });

    it('falls back to the topic for an empty message', () => {
      expect(feedbackIssueTitle('', 'Share an idea')).toBe('[Feedback] Share an idea');
    });
  });

  describe('type', () => {
    it.each([
      ['Report a bug', undefined, 'Bug'],
      ['AI Apps Feedback', 'bug', 'Bug'],
      ['Share an idea', undefined, 'Feature'],
      ['Give feedback', undefined, 'Improvement'],
      ['AI Apps Feedback', 'request', 'Improvement'],
    ])('%s with reportKind %s → %s', (topic, reportKind, expected) => {
      expect(feedbackTypeName(topic, reportKind)).toBe(expected);
    });
  });

  it('builds the full issue for a bug report', async () => {
    images.rehost.mockResolvedValue(['![Screenshot 1](https://uploads.linear.app/a.png)']);
    prisma.contactSupportRequest.findUnique.mockResolvedValue(
      request({ message: '<p>Search is slow</p><p><img src="https://images.test/a.png"></p>' })
    );

    const draft = await handler.buildIssue(row());

    expect(draft).toEqual({
      teamId: 'lab-team',
      stateId: 'backlog-state',
      title: '[Feedback] Search is slow',
      description: [
        'Reported by [Ada](https://labos.test/members/m1) · Report a bug · production',
        'Page: <https://labos.test/members?q=x>',
        '## What they said\n\nSearch is slow',
        '## Screenshots\n\n![Screenshot 1](https://uploads.linear.app/a.png)',
        '## Expected result\n\n_Fill in during triage before moving to Todo._',
        '---\nLabOS contact-support request `cs1`',
      ].join('\n\n'),
      labelIds: ['user-feedback-label', 'bug-label'],
      createAsUser: 'Ada',
    });
    expect(images.rehost).toHaveBeenCalledWith([{ src: 'https://images.test/a.png' }], ['images.test']);
  });

  it('puts AI Apps feedback into the project and maps priority and report kind', async () => {
    prisma.contactSupportRequest.findUnique.mockResolvedValue(
      request({
        topic: 'AI Apps Feedback',
        metadata: { uid: 'm1', page: 'https://labos.test/pl-infra/ai-apps', reportKind: 'bug', priority: 'P1' },
      })
    );
    const draft = await handler.buildIssue(row({ projectId: 'ai-apps-project' }));
    expect(draft).toMatchObject({
      projectId: 'ai-apps-project',
      priority: 2,
      labelIds: ['user-feedback-label', 'bug-label'],
    });
  });

  it('sets no project and no priority when the request has none', async () => {
    const draft = await handler.buildIssue(row());
    expect(draft).not.toHaveProperty('projectId');
    expect(draft).not.toHaveProperty('priority');
  });

  it('keeps only the User feedback label when the team has no matching Type label', async () => {
    linear.team.mockResolvedValue({
      id: 'lab-team',
      key: 'LAB',
      name: 'LabOS',
      private: false,
      triageEnabled: false,
      states: [],
      labels: [],
      projects: [],
    });
    const draft = await handler.buildIssue(row());
    expect(draft.labelIds).toEqual(['user-feedback-label']);
  });

  it('includes a Context section when the request has one', async () => {
    prisma.contactSupportRequest.findUnique.mockResolvedValue(
      request({ metadata: { uid: 'm1', context: { env: 'prod', viewport: '1440x900' } } })
    );
    const draft = await handler.buildIssue(row());
    expect(draft.description).toContain('## Context\n\n```json\n{\n  "env": "prod",\n  "viewport": "1440x900"\n}\n```');
    expect(draft.description.indexOf('## Context')).toBeLessThan(draft.description.indexOf('## Expected result'));
  });

  it('omits the page when it is not an http URL', async () => {
    prisma.contactSupportRequest.findUnique.mockResolvedValue(
      request({ metadata: { uid: 'm1', page: 'javascript:alert(1)' } })
    );
    const draft = await handler.buildIssue(row());
    expect(draft.description).not.toContain('Page:');
  });

  describe('privacy', () => {
    it('never includes the reporter email', async () => {
      const draft = await handler.buildIssue(row());
      expect(`${draft.title}\n${draft.description}`).not.toContain('ada_l@b.co');
      expect(draft.description).toContain('[Ada](https://labos.test/members/m1)');
    });

    it('hides the reporter email when they typed it into the message', async () => {
      prisma.contactSupportRequest.findUnique.mockResolvedValue(
        request({ message: '<p>ADA_L@b.co here</p><p>reach me at ada_l@b.co</p>' })
      );
      const draft = await handler.buildIssue(row());
      expect(draft.title).toBe('[Feedback] [email hidden] here');
      expect(draft.description).toContain('reach me at [email hidden]');
      expect(draft.description.toLowerCase()).not.toMatch(/ada\\?_l@b\.co/);
    });

    it('uses the member name from the database, not the typed name', async () => {
      const draft = await handler.buildIssue(row());
      expect(draft.createAsUser).toBe('Ada');
      expect(draft.description).not.toContain('Ada (typed)');
    });
  });

  describe('failures', () => {
    it('fails permanently when the request is gone', async () => {
      prisma.contactSupportRequest.findUnique.mockResolvedValue(null);
      await expect(handler.buildIssue(row())).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
    });

    it('fails permanently when the reporter is gone', async () => {
      prisma.member.findUnique.mockResolvedValue(null);
      await expect(handler.buildIssue(row())).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
    });

    it('fails (retryably) when platform feedback is no longer configured', async () => {
      delete process.env.FEEDBACK_LINEAR_PLATFORM_TEAM_ID;
      const error = await handler.buildIssue(row()).catch((e) => e);
      expect(error).not.toBeInstanceOf(FeedbackLinearPermanentError);
      expect(error.message).toBe('Platform feedback to Linear is not configured');
    });
  });
});

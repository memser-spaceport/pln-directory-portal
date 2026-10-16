import { FeedbackLinearIssue } from '@prisma/client';

// Factories keep Jest away from axios's ESM build and the Prisma service import chain.
jest.mock('axios', () => ({ create: jest.fn(() => ({ post: jest.fn(), get: jest.fn(), put: jest.fn() })) }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));

import {
  FeedbackLinearHandlerRegistry,
  FeedbackLinearPermanentError,
} from '../feedback-linear/feedback-linear-handlers';
import { AiAppFeedbackLinearHandler } from './ai-app-feedback-linear.handler';
import { AI_APPS_PORTAL_URL } from './ai-apps.constants';

const PORTAL = AI_APPS_PORTAL_URL || 'https://labos.test';

const ENV: Record<string, string> = {
  FEEDBACK_LINEAR_CLIENT_ID: 'cid',
  FEEDBACK_LINEAR_CLIENT_SECRET: 'secret',
  FEEDBACK_LINEAR_IMAGE_HOSTS: 'images.test',
  WEB_UI_BASE_URL: 'https://labos.test',
  ENVIRONMENT: 'production',
};

const ITEM = {
  uid: 'fb-1',
  appUid: 'app-1',
  memberUid: 'reporter-1',
  text: '<p>Filters reset on refresh</p><p><img src="https://images.test/shot.png" data-flat-src="https://images.test/flat.png"></p><ol><li>#1 Save button — /settings — button "Save": does nothing</li></ol><p><img src="https://images.test/crop1.png"></p>',
  kind: 'FEEDBACK',
  reportKind: 'bug',
  priority: 'P0',
  context: { env: 'prod', path: '/settings', viewport: '1440x900', userAgent: 'UA' },
  _count: { pins: 1 },
};
const APP = { uid: 'app-1', memberUid: 'owner-1', name: 'Ops Board' };

describe('AiAppFeedbackLinearHandler', () => {
  const saved: Record<string, string | undefined> = {};
  let prisma: {
    aiAppFeedback: { findUnique: jest.Mock };
    aiApp: { findUnique: jest.Mock };
    member: { findUnique: jest.Mock };
    aiAppFeedbackComment: { findUnique: jest.Mock };
  };
  let images: { rehost: jest.Mock };
  let teamMeta: { intakeStateId: jest.Mock; labelId: jest.Mock; typeLabelId: jest.Mock };
  let registry: FeedbackLinearHandlerRegistry;
  let handler: AiAppFeedbackLinearHandler;

  function row(overrides: Partial<FeedbackLinearIssue> = {}): FeedbackLinearIssue {
    const now = new Date();
    return {
      id: 1,
      uid: 'r1',
      sourceType: 'AI_APP_FEEDBACK',
      sourceUid: 'fb-1',
      teamId: 'team-1',
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
      aiAppFeedback: { findUnique: jest.fn().mockResolvedValue(ITEM) },
      aiApp: { findUnique: jest.fn().mockResolvedValue(APP) },
      member: {
        findUnique: jest
          .fn()
          .mockImplementation(({ where }) =>
            Promise.resolve(
              where.uid === 'reporter-1'
                ? { uid: 'reporter-1', name: 'Ada', email: 'ada@pl.test' }
                : { uid: 'owner-1', name: 'Olga' }
            )
          ),
      },
      aiAppFeedbackComment: {
        findUnique: jest.fn().mockResolvedValue({ text: '<p>Fixed in <strong>v2</strong></p>' }),
      },
    };
    images = {
      rehost: jest
        .fn()
        .mockResolvedValue([
          '![Screenshot 1](https://uploads.linear.app/1.png)',
          '![Screenshot 2](https://uploads.linear.app/2.png)',
        ]),
    };
    teamMeta = {
      intakeStateId: jest.fn().mockResolvedValue('triage-state'),
      labelId: jest.fn().mockResolvedValue('user-feedback-label'),
      typeLabelId: jest.fn().mockImplementation((_team, name) => Promise.resolve(name === 'Bug' ? 'bug-label' : null)),
    };
    registry = new FeedbackLinearHandlerRegistry();
    handler = new AiAppFeedbackLinearHandler(prisma as never, registry, images as never, teamMeta as never);
  });

  afterEach(() => {
    for (const key of Object.keys(ENV)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it('registers itself for AI_APP_FEEDBACK', () => {
    handler.onModuleInit();
    expect(registry.get('AI_APP_FEEDBACK')).toBe(handler);
  });

  it('builds the full issue for pinned feedback', async () => {
    const draft = await handler.buildIssue(row({ projectId: 'proj-1' }));

    expect(draft).toMatchObject({
      teamId: 'team-1',
      stateId: 'triage-state',
      projectId: 'proj-1',
      title: '[Ops Board] Filters reset on refresh',
      labelIds: ['user-feedback-label', 'bug-label'],
      priority: 1,
      createAsUser: 'Ada',
    });
    const sections = draft.description.split('\n\n');
    expect(sections[0]).toBe(
      'Reported by [Ada](https://labos.test/members/reporter-1) · Ops Board, owner [Olga](https://labos.test/members/owner-1) · prod'
    );
    expect(draft).not.toHaveProperty('assigneeId');
    const order = ['## What they said', '## Screenshots', '## Context', '## Expected result', '[Open in LabOS]'].map(
      (heading) => draft.description.indexOf(heading)
    );
    expect(order.every((index) => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // The pin list as written in the text, and both images (screenshot + crop) under Screenshots.
    expect(draft.description).toContain('Save button');
    expect(images.rehost).toHaveBeenCalledWith(
      [
        { src: 'https://images.test/shot.png', flatSrc: 'https://images.test/flat.png' },
        { src: 'https://images.test/crop1.png' },
      ],
      ['images.test']
    );
    expect(draft.description).toContain('"viewport": "1440x900"');
    expect(draft.description).toContain(
      `[Open in LabOS](${PORTAL}/pl-infra/ai-apps/app-1?feedback=fb-1) · AI App feedback \`fb-1\``
    );
    expect(draft.description).toContain('_Fill in during triage before moving to Todo._');
  });

  it('links whole-app feedback to the Feedback list', async () => {
    prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...ITEM, _count: { pins: 0 } });
    const draft = await handler.buildIssue(row());
    expect(draft.description).toContain(`(${PORTAL}/pl-infra/ai-apps/feedback?item=fb-1)`);
  });

  it('hides the reporter email typed into the text, in the title and the body', async () => {
    prisma.aiAppFeedback.findUnique.mockResolvedValue({
      ...ITEM,
      text: '<p>ADA@pl.test cannot log in</p><p>write to ada@pl.test</p>',
    });
    const draft = await handler.buildIssue(row());
    expect(draft.title).toBe('[Ops Board] [email hidden] cannot log in');
    expect(draft.description).toContain('write to [email hidden]');
    expect(`${draft.title}${draft.description}`.toLowerCase()).not.toContain('ada@pl.test');
  });

  it('maps a request to Improvement when the team has it', async () => {
    teamMeta.typeLabelId.mockImplementation((_team, name) => Promise.resolve(name === 'Improvement' ? 'imp' : null));
    prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...ITEM, reportKind: 'request' });
    const draft = await handler.buildIssue(row());
    expect(draft.labelIds).toEqual(['user-feedback-label', 'imp']);
  });

  it('sets no Type, no priority and no User feedback label when there is nothing to map', async () => {
    teamMeta.labelId.mockResolvedValue(null);
    prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...ITEM, reportKind: null, priority: null, context: null });
    const draft = await handler.buildIssue(row());
    expect(draft).not.toHaveProperty('labelIds');
    expect(draft).not.toHaveProperty('priority');
    expect(teamMeta.typeLabelId).not.toHaveBeenCalled();
    expect(draft.description).not.toContain('## Context');
    expect(draft.description.split('\n\n')[0]).toContain('· production');
  });

  it('leaves out the owner when the owner is gone', async () => {
    prisma.member.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.uid === 'reporter-1' ? { uid: 'reporter-1', name: 'Ada', email: 'ada@pl.test' } : null)
    );
    const draft = await handler.buildIssue(row());
    expect(draft.description.split('\n\n')[0]).toBe(
      'Reported by [Ada](https://labos.test/members/reporter-1) · Ops Board · prod'
    );
  });

  it('uses the team intake state', async () => {
    await handler.buildIssue(row());
    expect(teamMeta.intakeStateId).toHaveBeenCalledWith('team-1');
  });

  it('fails permanently when the item is gone', async () => {
    prisma.aiAppFeedback.findUnique.mockResolvedValue(null);
    await expect(handler.buildIssue(row())).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
  });

  it('fails permanently when the reporter is gone', async () => {
    prisma.member.findUnique.mockResolvedValue(null);
    await expect(handler.buildIssue(row())).rejects.toBeInstanceOf(FeedbackLinearPermanentError);
  });

  describe('buildComment', () => {
    it('renders the closing note as markdown', async () => {
      await expect(handler.buildComment(row(), 'note-1')).resolves.toBe('Closing note from LabOS:\n\nFixed in **v2**');
    });

    it('returns null when the comment is gone', async () => {
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(null);
      await expect(handler.buildComment(row(), 'note-1')).resolves.toBeNull();
    });
  });
});

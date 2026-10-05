import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  RequestMethod,
  UnprocessableEntityException,
} from '@nestjs/common';

// axios ships ESM (not in the jest transform allowlist) and these paths never call it.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import 'reflect-metadata';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { AiAppsService, MAX_COMMENTS_PER_FEEDBACK } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { CreateFeedbackCommentSchema } from './dto/feedback-comment.dto';
import { AgentUpdateFeedbackStatusSchema } from './dto/update-feedback-status.dto';
import { feedbackNotificationExcerpt } from './ai-apps.constants';

/*
 * Phase 2 of AI Apps feedback: a flat conversation under each feedback item.
 * Participants are the app's creator (creator-1), directory admins (admin-1) and
 * the member who left the item (member-1); anyone else (stranger-1) is out.
 */

const APP = { uid: 'app-1', name: 'Grant Tracker', memberUid: 'creator-1', access: 'OPEN', status: 'READY' };
const FEEDBACK = { uid: 'fb-1', appUid: 'app-1', memberUid: 'member-1', _count: { pins: 1 } };
const ADMIN = { memberRoles: [{ name: 'DIRECTORYADMIN' }] };
const NOT_ADMIN = { memberRoles: [] };

function buildService(overrides: { app?: any; feedback?: any; earlier?: Array<{ memberUid: string }> } = {}) {
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(overrides.app ?? APP) },
    aiAppFeedback: {
      findUnique: jest.fn().mockResolvedValue(overrides.feedback === undefined ? FEEDBACK : overrides.feedback),
      findMany: jest.fn(),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...FEEDBACK, ...data })),
    },
    aiAppFeedbackComment: {
      findMany: jest.fn().mockResolvedValue(overrides.earlier ?? []),
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'c-new', kind: 'REPLY', createdAt: new Date(5), ...data })
        ),
      delete: jest.fn().mockResolvedValue({}),
    },
    aiAppFeedbackPin: { findMany: jest.fn() },
    member: {
      findMany: jest.fn().mockResolvedValue([
        { uid: 'member-1', name: 'Ada', image: null },
        { uid: 'creator-1', name: 'Cleo', image: { url: 'https://img/cleo.png' } },
        { uid: 'admin-1', name: 'Ann', image: null },
      ]),
      findUnique: jest.fn().mockResolvedValue(NOT_ADMIN),
    },
  };
  const push = { create: jest.fn().mockResolvedValue({}) };
  const service = new AiAppsService(prisma as any, {} as any, push as any, { trackEvent: jest.fn() } as any);
  return { service, prisma, push };
}

const recipientsOf = (push: { create: jest.Mock }) => push.create.mock.calls.map(([n]) => n.recipientUid).sort();

describe('AiAppsService feedback conversation', () => {
  describe('who may take part', () => {
    it.each([
      ['the member who left the feedback', 'member-1', NOT_ADMIN],
      ['the app creator', 'creator-1', NOT_ADMIN],
      ['a directory admin', 'admin-1', ADMIN],
    ])('lets %s read the replies', async (_who, requester, roles) => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue(roles);
      await expect(service.listFeedbackComments(requester, 'app-1', 'fb-1')).resolves.toEqual([]);
    });

    it('keeps any other member out of reading and replying', async () => {
      const { service, prisma } = buildService();
      await expect(service.listFeedbackComments('stranger-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      await expect(service.addFeedbackComment('stranger-1', 'app-1', 'fb-1', 'hi')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.aiAppFeedbackComment.create).not.toHaveBeenCalled();
    });

    it('404s for feedback that belongs to another app, and for a deleted app', async () => {
      const other = buildService({ feedback: { ...FEEDBACK, appUid: 'app-2' } });
      await expect(other.service.listFeedbackComments('creator-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
      const deleted = buildService({ app: { ...APP, status: 'DELETED' } });
      await expect(deleted.service.listFeedbackComments('creator-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('listFeedbackComments', () => {
    it('returns the conversation oldest first, with each author', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackComment.findMany.mockResolvedValue([
        { uid: 'c-1', text: 'Which chart?', kind: 'REPLY', createdAt: new Date(1), memberUid: 'creator-1' },
        { uid: 'c-2', text: 'The trend one', kind: 'REPLY', createdAt: new Date(2), memberUid: 'member-1' },
      ]);

      const result = await service.listFeedbackComments('member-1', 'app-1', 'fb-1');

      expect(prisma.aiAppFeedbackComment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { feedbackUid: 'fb-1' }, orderBy: { createdAt: 'asc' } })
      );
      expect(result.map((c) => [c.uid, c.member?.name])).toEqual([
        ['c-1', 'Cleo'],
        ['c-2', 'Ada'],
      ]);
      expect(result[0]).not.toHaveProperty('memberUid');
    });
  });

  describe('addFeedbackComment', () => {
    it('stores the reply as written by the requester', async () => {
      const { service, prisma } = buildService();
      const reply = await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Fixed on staging');

      expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: { feedbackUid: 'fb-1', memberUid: 'creator-1', text: 'Fixed on staging' } })
      );
      expect(reply).toEqual(expect.objectContaining({ uid: 'c-new', text: 'Fixed on staging' }));
      expect(reply.member?.name).toBe('Cleo');
    });

    it('tells the member who left it when the creator replies, and not the creator', async () => {
      const { service, push } = buildService();
      await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Which chart?');

      expect(recipientsOf(push)).toEqual(['member-1']);
      expect(push.create).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'AI_APP',
          title: 'New reply on your feedback · Grant Tracker',
          description: 'Which chart?',
          link: '/pl-infra/ai-apps/app-1?feedback=fb-1',
          isPublic: false,
          metadata: expect.objectContaining({ trigger: 'feedback_reply', feedbackUid: 'fb-1' }),
        })
      );
    });

    it('tells the creator when the member replies back', async () => {
      const { service, push } = buildService({ earlier: [{ memberUid: 'creator-1' }] });
      await service.addFeedbackComment('member-1', 'app-1', 'fb-1', 'The trend one');

      expect(recipientsOf(push)).toEqual(['creator-1']);
      expect(push.create.mock.calls[0][0].title).toBe('New reply on feedback · Grant Tracker');
    });

    it('leaves out an admin who never wrote in the thread, and includes one who did', async () => {
      const quiet = buildService();
      quiet.prisma.member.findUnique.mockResolvedValue(ADMIN);
      await quiet.service.addFeedbackComment('member-1', 'app-1', 'fb-1', 'Still broken');
      expect(recipientsOf(quiet.push)).toEqual(['creator-1']);

      const involved = buildService({ earlier: [{ memberUid: 'admin-1' }] });
      involved.prisma.member.findUnique.mockResolvedValue(ADMIN);
      await involved.service.addFeedbackComment('member-1', 'app-1', 'fb-1', 'Still broken');
      expect(recipientsOf(involved.push)).toEqual(['admin-1', 'creator-1']);
    });

    it('an admin replying tells both the member and the creator', async () => {
      const { service, prisma, push } = buildService();
      prisma.member.findUnique.mockResolvedValue(ADMIN);
      await service.addFeedbackComment('admin-1', 'app-1', 'fb-1', 'Looking into it');
      expect(recipientsOf(push)).toEqual(['creator-1', 'member-1']);
    });

    it('notifies nobody when the creator replies on their own feedback', async () => {
      const { service, push } = buildService({ feedback: { ...FEEDBACK, memberUid: 'creator-1' } });
      await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Note to self');
      expect(push.create).not.toHaveBeenCalled();
    });

    it('links a whole-app item (no pin) to the Feedback list instead of the page', async () => {
      const { service, push } = buildService({ feedback: { ...FEEDBACK, _count: { pins: 0 } } });
      await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Thanks!');
      expect(push.create.mock.calls[0][0].link).toBe('/pl-infra/ai-apps/feedback?item=fb-1');
    });

    it('keeps the reply when a notification fails', async () => {
      const { service, prisma, push } = buildService();
      push.create.mockRejectedValue(new Error('socket down'));
      await expect(service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Hi')).resolves.toEqual(
        expect.objectContaining({ uid: 'c-new' })
      );
      expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalled();
    });

    it(`refuses the ${MAX_COMMENTS_PER_FEEDBACK + 1}st comment on one item`, async () => {
      const earlier = Array.from({ length: MAX_COMMENTS_PER_FEEDBACK }, () => ({ memberUid: 'member-1' }));
      const { service, prisma } = buildService({ earlier });
      await expect(service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'one more')).rejects.toBeInstanceOf(
        ConflictException
      );
      expect(prisma.aiAppFeedbackComment.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteFeedbackComment', () => {
    const comment = (memberUid: string, feedbackUid = 'fb-1', appUid = 'app-1') => ({
      uid: 'c-1',
      memberUid,
      feedbackUid,
      feedback: { appUid },
    });

    it('lets the author delete their reply', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(comment('member-1'));
      await service.deleteFeedbackComment('member-1', 'app-1', 'fb-1', 'c-1');
      expect(prisma.aiAppFeedbackComment.delete).toHaveBeenCalledWith({ where: { uid: 'c-1' } });
    });

    it('lets a directory admin delete anyone’s reply', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(comment('member-1'));
      prisma.member.findUnique.mockResolvedValue(ADMIN);
      await service.deleteFeedbackComment('admin-1', 'app-1', 'fb-1', 'c-1');
      expect(prisma.aiAppFeedbackComment.delete).toHaveBeenCalled();
    });

    it('does not let the creator delete the member’s reply', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(comment('member-1'));
      await expect(service.deleteFeedbackComment('creator-1', 'app-1', 'fb-1', 'c-1')).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(prisma.aiAppFeedbackComment.delete).not.toHaveBeenCalled();
    });

    it('404s for a reply under another item or another app', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(comment('member-1', 'fb-9'));
      await expect(service.deleteFeedbackComment('member-1', 'app-1', 'fb-1', 'c-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
      prisma.aiAppFeedbackComment.findUnique.mockResolvedValue(comment('member-1', 'fb-1', 'app-2'));
      await expect(service.deleteFeedbackComment('member-1', 'app-1', 'fb-1', 'c-1')).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('agent closing note', () => {
    it('stores the note as the creator’s CLOSING_NOTE and tells the member once', async () => {
      const { service, prisma, push } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...FEEDBACK, memberUid: 'member-1' });

      await service.updateAgentFeedbackStatus(
        'creator-1',
        'app-1',
        'fb-1',
        'IMPLEMENTED',
        undefined,
        'Axis labels added'
      );

      expect(prisma.aiAppFeedback.update).toHaveBeenCalledWith({
        where: { uid: 'fb-1' },
        data: { status: 'IMPLEMENTED' },
      });
      expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalledWith({
        data: { feedbackUid: 'fb-1', memberUid: 'creator-1', text: 'Axis labels added', kind: 'CLOSING_NOTE' },
      });
      expect(recipientsOf(push)).toEqual(['member-1']);
      expect(push.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Shipped: your feedback on Grant Tracker',
          description: 'Axis labels added',
          metadata: expect.objectContaining({ trigger: 'feedback_shipped' }),
        })
      );
    });

    it('a bare status change stores nothing and tells nobody', async () => {
      const { service, prisma, push } = buildService();
      await service.updateAgentFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED');
      expect(prisma.aiAppFeedbackComment.create).not.toHaveBeenCalled();
      expect(push.create).not.toHaveBeenCalled();
    });

    it('refuses a note with any status other than IMPLEMENTED, before changing anything', async () => {
      const { service, prisma } = buildService();
      await expect(
        service.updateAgentFeedbackStatus('creator-1', 'app-1', 'fb-1', 'VIEWED', undefined, 'Saw it')
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(prisma.aiAppFeedback.update).not.toHaveBeenCalled();
    });

    it('does not notify the creator about their own feedback', async () => {
      const { service, prisma, push } = buildService();
      prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...FEEDBACK, memberUid: 'creator-1' });
      await service.updateAgentFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED', undefined, 'Done');
      expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalled();
      expect(push.create).not.toHaveBeenCalled();
    });
  });

  describe('reply counts on the reads', () => {
    it('pins carry their item’s commentCount', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackPin.findMany.mockResolvedValue([
        {
          uid: 'pin-1',
          n: 1,
          feedback: {
            uid: 'fb-1',
            status: 'NEW',
            createdAt: new Date(1),
            memberUid: 'member-1',
            _count: { comments: 3 },
          },
        },
      ]);
      const [pin] = await service.listAppFeedbackPins('creator-1', 'app-1');
      expect(pin.feedback).toEqual(expect.objectContaining({ uid: 'fb-1', commentCount: 3 }));
      expect(pin.feedback).not.toHaveProperty('_count');
    });

    it('the agent gets each item’s own conversation, in order', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedback.findMany.mockResolvedValue([
        {
          uid: 'fb-2',
          appUid: 'app-1',
          memberUid: 'member-1',
          pins: [],
          _count: { comments: 1 },
          comments: [{ uid: 'c-0', text: 'Done?', kind: 'REPLY', createdAt: new Date(3), memberUid: 'admin-1' }],
        },
        {
          uid: 'fb-1',
          appUid: 'app-1',
          memberUid: 'member-1',
          pins: [],
          _count: { comments: 2 },
          comments: [
            { uid: 'c-1', text: 'Which chart?', kind: 'REPLY', createdAt: new Date(1), memberUid: 'creator-1' },
            { uid: 'c-2', text: 'Trend', kind: 'REPLY', createdAt: new Date(2), memberUid: 'member-1' },
          ],
        },
      ]);

      const rows = await service.listAgentFeedback('creator-1', 'app-1');

      expect(rows.map((r) => [r.uid, r.commentCount, (r.comments ?? []).map((c) => c.uid)])).toEqual([
        ['fb-2', 1, ['c-0']],
        ['fb-1', 2, ['c-1', 'c-2']],
      ]);
      expect(rows[1].comments?.[0].member?.name).toBe('Cleo');
    });
  });
});

describe('feedback comment bodies', () => {
  it('trims the reply and refuses blank, null or overlong text', () => {
    expect(CreateFeedbackCommentSchema.parse({ text: '  Still broken \n' })).toEqual({ text: 'Still broken' });
    expect(CreateFeedbackCommentSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(CreateFeedbackCommentSchema.safeParse({ text: null }).success).toBe(false);
    expect(CreateFeedbackCommentSchema.safeParse({ text: 'x'.repeat(2001) }).success).toBe(false);
  });

  it('reads a blank closing note as none, so status-only calls keep working', () => {
    expect(AgentUpdateFeedbackStatusSchema.parse({ status: 'VIEWED' })).toEqual({ status: 'VIEWED' });
    expect(AgentUpdateFeedbackStatusSchema.parse({ status: 'VIEWED', note: null }).note).toBeUndefined();
    expect(AgentUpdateFeedbackStatusSchema.parse({ status: 'VIEWED', note: '' }).note).toBeUndefined();
    expect(AgentUpdateFeedbackStatusSchema.parse({ status: 'IMPLEMENTED', note: ' Fixed ' }).note).toBe('Fixed');
  });

  it('shortens a long reply for the notification line', () => {
    expect(feedbackNotificationExcerpt('a\n\nb')).toBe('a b');
    const long = feedbackNotificationExcerpt('word '.repeat(60));
    expect(long.length).toBeLessThanOrEqual(140);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('feedback conversation routes', () => {
  const proto = AiAppsController.prototype as any;
  it.each([
    ['listFeedbackComments', RequestMethod.GET, ':uid/feedback/:feedbackUid/comments'],
    ['addFeedbackComment', RequestMethod.POST, ':uid/feedback/:feedbackUid/comments'],
    ['deleteFeedbackComment', RequestMethod.DELETE, ':uid/feedback/:feedbackUid/comments/:commentUid'],
  ])('%s is %s %s behind the member guards', (handler, method, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, proto[handler])).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, proto[handler])).toBe(method);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[handler])).toEqual([UserTokenCheckGuard, RbacGuard]);
  });
});

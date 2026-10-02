import { BadRequestException, ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';

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
import { AiAppsService } from './ai-apps.service';
import { AiAppsController } from './ai-apps.controller';
import { UserTokenCheckGuard } from '../guards/user-token-check.guard';
import { RbacGuard } from '../rbac/rbac.guard';
import { rebuildCommentText } from './ai-app-feedback-pins';
import { aiAppFeedbackPath, feedbackNotificationExcerpt } from './ai-apps.constants';
import { SubmitFeedbackSchema, type FeedbackPinInput } from './dto/submit-feedback.dto';
import { EditFeedbackCommentSchema, EditFeedbackNoteSchema } from './dto/feedback-comment.dto';

/*
 * Feedback items have a kind: FEEDBACK (the written form — the app's creator,
 * directory admins and its author read it) and COMMENT (pinned in the live app
 * — anyone who may open the app reads it and can reply). Only an item's author
 * edits it; its author or an admin deletes it.
 *
 * Cast: the app's creator is creator-1, a directory admin admin-1, the member
 * who left the item member-1, and stranger-1 another member who can open the
 * app (it is OPEN) but has no part in the item.
 */

const APP = {
  uid: 'app-1',
  name: 'Grant Tracker',
  memberUid: 'creator-1',
  access: 'OPEN',
  status: 'READY',
  feedbackEnabled: true,
};
const CROP = '<img src="https://cdn.example/crop.png" alt="Pin" class="ai-app-pin-crop">';
const COMMENT_ITEM = {
  uid: 'fb-1',
  appUid: 'app-1',
  memberUid: 'member-1',
  kind: 'COMMENT',
  text: `<p>Old note</p><p><code>#save</code> · /pins</p><p>${CROP}</p>`,
  _count: { pins: 1 },
};
const FEEDBACK_ITEM = { ...COMMENT_ITEM, kind: 'FEEDBACK' };
const PIN: FeedbackPinInput = {
  n: 1,
  env: 'prod',
  pagePath: '/pins',
  pageQuery: null,
  selector: '#save',
  tag: 'button',
  text: 'Save',
  role: null,
  ariaLabel: null,
  component: null,
  source: null,
  rect: { x: 1, y: 2, w: 3, h: 4 },
  viewportW: 800,
  viewportH: 600,
  note: 'Label is unclear',
  cropUrl: null,
};
const ADMIN = { memberRoles: [{ name: 'DIRECTORYADMIN' }] };
const NOT_ADMIN = { memberRoles: [] };

function buildService(overrides: { app?: any; item?: any; earlier?: Array<{ memberUid: string }> } = {}) {
  const item = overrides.item ?? COMMENT_ITEM;
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(overrides.app ?? APP) },
    aiAppAllowedMember: { findUnique: jest.fn().mockResolvedValue(null) },
    aiAppFeedback: {
      findUnique: jest.fn().mockResolvedValue(item),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'fb-new', kind: 'FEEDBACK', status: 'NEW', createdAt: new Date(1), ...data })
        ),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ ...item, ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    aiAppFeedbackPin: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    aiAppFeedbackComment: {
      findMany: jest.fn().mockResolvedValue(overrides.earlier ?? []),
      findUnique: jest.fn(),
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'c-new', kind: 'REPLY', createdAt: new Date(5), editedAt: null, ...data })
        ),
      update: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'c-1', kind: 'REPLY', createdAt: new Date(1), memberUid: 'stranger-1', ...data })
        ),
    },
    member: {
      findMany: jest.fn().mockResolvedValue([
        { uid: 'member-1', name: 'Ada', image: null },
        { uid: 'creator-1', name: 'Cleo', image: null },
        { uid: 'stranger-1', name: 'Sam', image: null },
      ]),
      findUnique: jest.fn().mockResolvedValue(NOT_ADMIN),
    },
    $transaction: jest.fn().mockImplementation((ops: Array<Promise<unknown>>) => Promise.all(ops)),
  };
  const push = { create: jest.fn().mockResolvedValue({}) };
  const service = new AiAppsService(prisma as any, {} as any, push as any, { trackEvent: jest.fn() } as any);
  return { service, prisma, push };
}

const recipientsOf = (push: { create: jest.Mock }) => push.create.mock.calls.map(([n]) => n.recipientUid).sort();

describe('posting a comment', () => {
  it('stores it as a COMMENT and tells the app creator, linking to the app', async () => {
    const { service, prisma, push } = buildService();
    await service.submitFeedback('member-1', 'app-1', '<p>Label is unclear</p>', { pins: [PIN], kind: 'COMMENT' });

    expect(prisma.aiAppFeedback.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'COMMENT', memberUid: 'member-1' }),
    });
    expect(recipientsOf(push)).toEqual(['creator-1']);
    expect(push.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'New comment on Grant Tracker',
        description: 'Ada: Label is unclear',
        link: '/pl-infra/ai-apps/app-1?feedback=fb-new',
        metadata: expect.objectContaining({ trigger: 'comment_new' }),
      })
    );
  });

  it('a comment points at exactly one element', async () => {
    const { service, prisma } = buildService();
    await expect(service.submitFeedback('member-1', 'app-1', 'x', { kind: 'COMMENT' })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.submitFeedback('member-1', 'app-1', 'x', { kind: 'COMMENT', pins: [PIN, { ...PIN, n: 2 }] })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.aiAppFeedback.create).not.toHaveBeenCalled();
  });

  it('the creator commenting on their own app is not told about it', async () => {
    const { service, push } = buildService();
    await service.submitFeedback('creator-1', 'app-1', '<p>Note</p>', { pins: [PIN], kind: 'COMMENT' });
    expect(push.create).not.toHaveBeenCalled();
  });

  it('plain feedback stays FEEDBACK (no kind written) and tells nobody', async () => {
    const { service, prisma, push } = buildService();
    await service.submitFeedback('member-1', 'app-1', '<p>Hi</p>');
    expect(prisma.aiAppFeedback.create.mock.calls[0][0].data).not.toHaveProperty('kind');
    expect(push.create).not.toHaveBeenCalled();
  });

  it('nothing is accepted for a deleted app, or while feedback is turned off', async () => {
    const deleted = buildService({ app: { ...APP, status: 'DELETED' } });
    await expect(deleted.service.submitFeedback('member-1', 'app-1', 'x')).rejects.toBeInstanceOf(NotFoundException);
    const off = buildService({ app: { ...APP, feedbackEnabled: false } });
    await expect(
      off.service.submitFeedback('member-1', 'app-1', 'x', { pins: [PIN], kind: 'COMMENT' })
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('who may read a thread', () => {
  it('anyone who may open the app reads a COMMENT and can reply', async () => {
    const { service, prisma } = buildService();
    await expect(service.listFeedbackComments('stranger-1', 'app-1', 'fb-1')).resolves.toEqual([]);
    await service.addFeedbackComment('stranger-1', 'app-1', 'fb-1', 'Same here');
    expect(prisma.aiAppFeedbackComment.create).toHaveBeenCalled();
  });

  it('a COMMENT on a private app is closed to members who may not open it', async () => {
    const { service } = buildService({ app: { ...APP, access: 'PRIVATE' } });
    await expect(service.listFeedbackComments('stranger-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });

  it('FEEDBACK stays with its author, the creator and admins', async () => {
    const { service } = buildService({ item: FEEDBACK_ITEM });
    await expect(service.listFeedbackComments('stranger-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    await expect(service.listFeedbackComments('member-1', 'app-1', 'fb-1')).resolves.toEqual([]);
  });

  it('replies are refused while feedback is turned off; reading still works', async () => {
    const { service } = buildService({ app: { ...APP, feedbackEnabled: false } });
    await expect(service.listFeedbackComments('stranger-1', 'app-1', 'fb-1')).resolves.toEqual([]);
    await expect(service.addFeedbackComment('stranger-1', 'app-1', 'fb-1', 'Hi')).rejects.toBeInstanceOf(
      ForbiddenException
    );
  });
});

describe('notifications follow who can read', () => {
  it('a reply on a COMMENT tells its author, the creator and other repliers, as a comment', async () => {
    const { service, push } = buildService({ earlier: [{ memberUid: 'stranger-1' }] });
    await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Fixed');
    expect(recipientsOf(push)).toEqual(['member-1', 'stranger-1']);
    const toAuthor = push.create.mock.calls.find(([n]) => n.recipientUid === 'member-1')[0];
    expect(toAuthor.title).toBe('New reply on your comment · Grant Tracker');
    const toOther = push.create.mock.calls.find(([n]) => n.recipientUid === 'stranger-1')[0];
    expect(toOther.title).toBe('New reply on a comment · Grant Tracker');
  });

  it('someone who can no longer open the app is not told', async () => {
    const { service, prisma, push } = buildService({
      app: { ...APP, access: 'PRIVATE' },
      earlier: [{ memberUid: 'stranger-1' }],
    });
    // member-1 (the author) is still on the whitelist; stranger-1 was removed.
    prisma.aiAppAllowedMember.findUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.appUid_environment_memberUid?.memberUid === 'member-1' ? { id: 1 } : null)
    );
    await service.addFeedbackComment('creator-1', 'app-1', 'fb-1', 'Fixed');
    expect(recipientsOf(push)).not.toContain('stranger-1');
  });

  it('the agent shipping a COMMENT tells its author and repliers, never the creator', async () => {
    const { service, prisma, push } = buildService({ earlier: [{ memberUid: 'stranger-1' }] });
    prisma.aiApp.findUnique.mockResolvedValue({ ...APP, status: 'READY' });
    await service.updateAgentFeedbackStatus('creator-1', 'app-1', 'fb-1', 'IMPLEMENTED', undefined, 'Done');
    expect(recipientsOf(push)).toEqual(['member-1', 'stranger-1']);
    expect(push.create.mock.calls.find(([n]) => n.recipientUid === 'member-1')[0].title).toBe(
      'Shipped: your comment on Grant Tracker'
    );
  });
});

describe('editing', () => {
  it('a reply’s author edits its text, marked as edited', async () => {
    const { service, prisma } = buildService();
    prisma.aiAppFeedbackComment.findUnique.mockResolvedValue({
      uid: 'c-1',
      memberUid: 'stranger-1',
      feedbackUid: 'fb-1',
    });
    const reply = await service.editFeedbackComment('stranger-1', 'app-1', 'fb-1', 'c-1', 'Better wording');
    expect(prisma.aiAppFeedbackComment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: 'c-1' }, data: { text: 'Better wording', editedAt: expect.any(Date) } })
    );
    expect(reply.text).toBe('Better wording');
  });

  it('nobody else edits a reply, not even the creator or an admin', async () => {
    const { service, prisma } = buildService();
    prisma.aiAppFeedbackComment.findUnique.mockResolvedValue({
      uid: 'c-1',
      memberUid: 'stranger-1',
      feedbackUid: 'fb-1',
    });
    await expect(service.editFeedbackComment('creator-1', 'app-1', 'fb-1', 'c-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    prisma.member.findUnique.mockResolvedValue(ADMIN);
    await expect(service.editFeedbackComment('admin-1', 'app-1', 'fb-1', 'c-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(prisma.aiAppFeedbackComment.update).not.toHaveBeenCalled();
  });

  it('a comment’s author edits its note: the text is rebuilt (screenshot kept, no path) with the pin, together', async () => {
    const { service, prisma } = buildService();
    await service.editFeedbackNote('member-1', 'app-1', 'fb-1', 'New <note>');

    expect(prisma.$transaction).toHaveBeenCalled();
    const { data } = prisma.aiAppFeedback.update.mock.calls[0][0];
    expect(data.editedAt).toEqual(expect.any(Date));
    expect(data.text).toContain('<p>New &lt;note&gt;</p>');
    expect(data.text).toContain('https://cdn.example/crop.png');
    expect(data.text).not.toContain('#save');
    expect(prisma.aiAppFeedbackPin.updateMany).toHaveBeenCalledWith({
      where: { feedbackUid: 'fb-1' },
      data: { note: 'New <note>' },
    });
  });

  it('FEEDBACK can’t be edited, someone else’s comment can’t be, nor by an author who lost access', async () => {
    const feedback = buildService({ item: FEEDBACK_ITEM });
    await expect(feedback.service.editFeedbackNote('member-1', 'app-1', 'fb-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    const other = buildService();
    await expect(other.service.editFeedbackNote('stranger-1', 'app-1', 'fb-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    const lostAccess = buildService({ app: { ...APP, access: 'PRIVATE' } });
    await expect(lostAccess.service.editFeedbackNote('member-1', 'app-1', 'fb-1', 'x')).rejects.toBeInstanceOf(
      ForbiddenException
    );
    expect(lostAccess.prisma.aiAppFeedback.update).not.toHaveBeenCalled();
  });
});

describe('deleting an item', () => {
  it('its author or an admin deletes it (pins and replies cascade)', async () => {
    const author = buildService();
    await author.service.deleteFeedbackItem('member-1', 'app-1', 'fb-1');
    expect(author.prisma.aiAppFeedback.delete).toHaveBeenCalledWith({ where: { uid: 'fb-1' } });

    const admin = buildService();
    admin.prisma.member.findUnique.mockResolvedValue(ADMIN);
    await admin.service.deleteFeedbackItem('admin-1', 'app-1', 'fb-1');
    expect(admin.prisma.aiAppFeedback.delete).toHaveBeenCalled();
  });

  it('the app creator can’t delete someone else’s item; a foreign item 404s', async () => {
    const { service, prisma } = buildService();
    await expect(service.deleteFeedbackItem('creator-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(ForbiddenException);
    prisma.aiAppFeedback.findUnique.mockResolvedValue({ ...COMMENT_ITEM, appUid: 'app-2' });
    await expect(service.deleteFeedbackItem('member-1', 'app-1', 'fb-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.aiAppFeedback.delete).not.toHaveBeenCalled();
  });
});

describe('helpers and bodies', () => {
  it('rebuildCommentText keeps the screenshot and drops the path line', () => {
    expect(rebuildCommentText('Line one\n\nLine two', COMMENT_ITEM.text)).toBe(
      `<p>Line one</p><p>Line two</p><p>${CROP}</p>`
    );
  });

  it('notification excerpts are plain text', () => {
    expect(feedbackNotificationExcerpt('<p>Hi &amp; <b>bye</b></p>')).toBe('Hi & bye');
  });

  it('a COMMENT always links to the app, even without a pin', () => {
    expect(aiAppFeedbackPath('app-1', 'fb-1', false, 'COMMENT')).toBe('/pl-infra/ai-apps/app-1?feedback=fb-1');
    expect(aiAppFeedbackPath('app-1', 'fb-1', false)).toBe('/pl-infra/ai-apps/feedback?item=fb-1');
  });

  it('kind is FEEDBACK or COMMENT; edits are trimmed and non-empty', () => {
    expect(SubmitFeedbackSchema.safeParse({ text: 'x', kind: 'COMMENT' }).success).toBe(true);
    expect(SubmitFeedbackSchema.safeParse({ text: 'x', kind: 'PUBLIC' }).success).toBe(false);
    expect(EditFeedbackNoteSchema.parse({ note: ' New ' })).toEqual({ note: 'New' });
    expect(EditFeedbackCommentSchema.safeParse({ text: '  ' }).success).toBe(false);
  });
});

describe('item routes', () => {
  const proto = AiAppsController.prototype as any;
  it.each([
    ['editFeedbackComment', RequestMethod.PATCH, ':uid/feedback/:feedbackUid/comments/:commentUid'],
    ['editFeedbackNote', RequestMethod.PATCH, ':uid/feedback/:feedbackUid/note'],
    ['deleteFeedbackItem', RequestMethod.DELETE, ':uid/feedback/:feedbackUid'],
  ])('%s is %s %s behind the member guards', (handler, method, path) => {
    expect(Reflect.getMetadata(PATH_METADATA, proto[handler])).toBe(path);
    expect(Reflect.getMetadata(METHOD_METADATA, proto[handler])).toBe(method);
    expect(Reflect.getMetadata(GUARDS_METADATA, proto[handler])).toEqual([UserTokenCheckGuard, RbacGuard]);
  });
});

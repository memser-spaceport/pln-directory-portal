import { ForbiddenException, NotFoundException } from '@nestjs/common';
import DOMPurify from 'isomorphic-dompurify';

// Same module stubs as ai-apps-feedback.spec.ts: the real ones pull ESM-only
// chains that break under ts-jest, and the feedback paths never call them.
jest.mock('axios', () => ({ isAxiosError: jest.fn(() => false) }));
jest.mock('../push-notifications/push-notifications.service', () => ({
  PushNotificationsService: jest.fn().mockImplementation(() => ({ create: jest.fn() })),
}));
jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: jest.fn(),
}));

import { AiAppsService } from './ai-apps.service';
import { parsePinsFromFeedbackHtml } from './ai-app-feedback-pins';
import { SubmitFeedbackSchema, type FeedbackContext, type FeedbackPinInput } from './dto/submit-feedback.dto';

const APP = { uid: 'app-1', memberUid: 'creator-1', appId: 'demo', access: 'OPEN', status: 'LIVE' };

const PIN: FeedbackPinInput = {
  n: 1,
  env: 'prod',
  pagePath: '/pins',
  pageQuery: null,
  selector: '#review',
  tag: 'button',
  text: 'Review now',
  role: null,
  ariaLabel: null,
  component: 'ReviewButton',
  source: null,
  rect: { x: 10, y: 20, w: 80, h: 32 },
  viewportW: 1280,
  viewportH: 800,
  note: 'Looks disabled until hover',
  cropUrl: 'https://cdn.example/crop-1.webp',
  ox: 0.25,
  oy: 0.5,
};

/** A pin from a client that predates the click point. */
const PIN_WITHOUT_POINT: FeedbackPinInput = { ...PIN, ox: undefined, oy: undefined };

const CONTEXT: FeedbackContext = {
  env: 'prod',
  appPath: '/pins?tab=open',
  labosUrl: 'https://directory.example/pl-infra/ai-apps/app-1/pins?tab=open',
  viewport: { w: 1280, h: 800 },
  pixelRatio: 2,
  touch: false,
  userAgent: 'Mozilla/5.0',
  bridge: { version: 1, capabilities: ['pick', 'describe', 'crop'] },
};

function buildService() {
  const prisma = {
    aiApp: { findUnique: jest.fn().mockResolvedValue(APP), findMany: jest.fn().mockResolvedValue([]) },
    aiAppFeedback: {
      create: jest
        .fn()
        .mockImplementation(({ data }) =>
          Promise.resolve({ uid: 'fb-1', createdAt: new Date(0), status: 'NEW', ...data })
        ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    aiAppFeedbackPin: { findMany: jest.fn().mockResolvedValue([]) },
    aiAppAllowedMember: { findUnique: jest.fn().mockResolvedValue(null) },
    member: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue({ memberRoles: [] }),
    },
  };
  const service = new AiAppsService(
    prisma as any,
    {} as any,
    { create: jest.fn() } as any,
    { trackEvent: jest.fn() } as any
  );
  return { service, prisma };
}

describe('feedback pins', () => {
  describe('SubmitFeedbackSchema', () => {
    it('accepts text alone, as older clients send it', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi' }).success).toBe(true);
    });

    it('accepts pins and context', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', pins: [PIN], context: CONTEXT }).success).toBe(true);
    });

    it.each([
      ['a non-https crop', { cropUrl: 'http://cdn.example/crop.webp' }],
      ['an inline data: crop', { cropUrl: 'data:image/png;base64,AAAA' }],
      ['a page path without a leading slash', { pagePath: 'pins' }],
      ['an unknown environment', { env: 'staging' }],
      ['an unexpected field', { html: '<button>' }],
      ['an oversized selector', { selector: 'x'.repeat(1001) }],
      ['a click point outside the element', { ox: 1.2 }],
      ['a negative click point', { oy: -0.1 }],
    ])('rejects a pin with %s', (_label, patch) => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', pins: [{ ...PIN, ...patch }] }).success).toBe(false);
    });

    it('accepts a pin without a click point (older clients)', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', pins: [PIN_WITHOUT_POINT] }).success).toBe(true);
    });

    /* The app-wide EmptyStringToNullInterceptor rewrites '' to null before
       validation; a pin with no note on an element with no text must still pass. */
    it('accepts a pin whose empty text and note arrive as null, and stores them as empty', () => {
      const parsed = SubmitFeedbackSchema.safeParse({ text: 'hi', pins: [{ ...PIN, text: null, note: null }] });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.pins?.[0]).toMatchObject({ text: '', note: '' });
    });

    it('accepts a context whose empty strings arrive as null', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', context: { ...CONTEXT, appPath: null } }).success).toBe(true);
    });

    it('rejects two pins with the same number', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', pins: [PIN, { ...PIN }] }).success).toBe(false);
    });

    it('rejects a context with an unexpected field', () => {
      expect(SubmitFeedbackSchema.safeParse({ text: 'hi', context: { ...CONTEXT, cookies: 'x' } }).success).toBe(false);
    });
  });

  describe('submitFeedback', () => {
    it('stores context and creates the pins in the same statement as the feedback', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p>hi</p>', { pins: [PIN], context: CONTEXT });
      expect(prisma.aiAppFeedback.create).toHaveBeenCalledTimes(1);
      const { data } = prisma.aiAppFeedback.create.mock.calls[0][0];
      expect(data.context).toEqual(CONTEXT);
      expect(data.pins.create).toEqual([PIN]);
    });

    it('stores a missing click point as null, so the pin falls back to the element corner', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p>hi</p>', { pins: [PIN_WITHOUT_POINT] });
      const { data } = prisma.aiAppFeedback.create.mock.calls[0][0];
      expect(data.pins.create[0]).toMatchObject({ ox: null, oy: null });
    });

    it('sends neither field when the client sent none', async () => {
      const { service, prisma } = buildService();
      await service.submitFeedback('member-1', 'app-1', '<p>hi</p>', { pins: [] });
      const { data } = prisma.aiAppFeedback.create.mock.calls[0][0];
      expect(data).not.toHaveProperty('pins');
      expect(data).not.toHaveProperty('context');
    });
  });

  describe('listAppFeedbackPins', () => {
    it('is for the creator: leaves out pins of IMPLEMENTED feedback by default, across both environments', async () => {
      const { service, prisma } = buildService();
      await service.listAppFeedbackPins('creator-1', 'app-1');
      const { where } = prisma.aiAppFeedbackPin.findMany.mock.calls[0][0];
      expect(where).toEqual({ feedback: { appUid: 'app-1', status: { not: 'IMPLEMENTED' } } });
    });

    it('includes resolved pins and narrows to one environment when asked', async () => {
      const { service, prisma } = buildService();
      await service.listAppFeedbackPins('creator-1', 'app-1', { includeResolved: true, env: 'preview' });
      const { where } = prisma.aiAppFeedbackPin.findMany.mock.calls[0][0];
      expect(where).toEqual({ env: 'preview', feedback: { appUid: 'app-1' } });
    });

    it('lets a directory admin read another member’s app', async () => {
      const { service, prisma } = buildService();
      prisma.member.findUnique.mockResolvedValue({ memberRoles: [{ name: 'DIRECTORYADMIN' }] });
      await expect(service.listAppFeedbackPins('admin-1', 'app-1')).resolves.toEqual([]);
    });

    it('refuses any other member', async () => {
      const { service, prisma } = buildService();
      await expect(service.listAppFeedbackPins('member-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.aiAppFeedbackPin.findMany).not.toHaveBeenCalled();
    });

    it('404s for a deleted app', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findUnique.mockResolvedValue({ ...APP, status: 'DELETED' });
      await expect(service.listAppFeedbackPins('creator-1', 'app-1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('attaches the submitter to each pin’s feedback, never the raw memberUid', async () => {
      const { service, prisma } = buildService();
      prisma.aiAppFeedbackPin.findMany.mockResolvedValue([
        { uid: 'pin-1', n: 1, feedback: { uid: 'fb-1', status: 'NEW', createdAt: new Date(0), memberUid: 'member-1' } },
      ]);
      prisma.member.findMany.mockResolvedValue([{ uid: 'member-1', name: 'Ada', image: null }]);
      const [pin] = await service.listAppFeedbackPins('creator-1', 'app-1');
      expect(pin.feedback.member).toEqual({ uid: 'member-1', name: 'Ada', image: null });
      expect(pin.feedback).not.toHaveProperty('memberUid');
    });
  });

  describe('listMyAppFeedbackPins', () => {
    it('returns only the requester’s own pins, resolved ones included', async () => {
      const { service, prisma } = buildService();
      await service.listMyAppFeedbackPins('member-1', 'app-1');
      const { where } = prisma.aiAppFeedbackPin.findMany.mock.calls[0][0];
      expect(where).toEqual({ feedback: { appUid: 'app-1', memberUid: 'member-1' } });
    });

    it('refuses a member who may not open a private app', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findUnique.mockResolvedValue({ ...APP, access: 'PRIVATE' });
      await expect(service.listMyAppFeedbackPins('member-1', 'app-1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.aiAppFeedbackPin.findMany).not.toHaveBeenCalled();
    });
  });

  describe('listAccessibleFeedback', () => {
    it('reports how many pins each row has, without sending them', async () => {
      const { service, prisma } = buildService();
      prisma.aiApp.findMany.mockResolvedValue([{ uid: 'app-1', name: 'Alpha' }]);
      prisma.aiAppFeedback.findMany.mockResolvedValue([
        {
          uid: 'fb-1',
          appUid: 'app-1',
          memberUid: 'member-1',
          text: 'x',
          status: 'NEW',
          createdAt: new Date(0),
          _count: { pins: 2 },
        },
      ]);
      const [row] = await service.listAccessibleFeedback('creator-1');
      expect(row.pinCount).toBe(2);
      expect(row).not.toHaveProperty('_count');
    });
  });

  describe('parsePinsFromFeedbackHtml (backfill)', () => {
    /**
     * The frontend's `pinsHtml` output for two pins (one without a note, one
     * whose crop failed), stored the way `submitFeedback` stores it: through
     * DOMPurify. Built here rather than imported because it lives in the
     * frontend repo; keep it in step with `element-pins/pinsHtml.ts`.
     */
    function storedFeedback(): string {
      const serialized = [
        {
          n: 1,
          note: 'Looks disabled until hover',
          detached: false,
          crop: 'https://cdn.example/crop-1.webp',
          selector: '#review',
          tag: 'button',
          text: 'Review now',
          html: '<button id="review">Review now</button>',
          role: null,
          ariaLabel: null,
          component: null,
          source: null,
          rect: { x: 10, y: 20, w: 80, h: 32 },
          page: { path: '/pins', title: 'Grant Tracker', viewportW: 1280, viewportH: 800 },
        },
        {
          n: 2,
          note: '',
          detached: false,
          crop: null,
          selector: '#q',
          tag: 'input',
          text: '',
          role: 'searchbox',
          ariaLabel: 'Search grants',
          component: null,
          source: null,
          rect: { x: 0, y: 100, w: 585, h: 21 },
          page: { path: '/pins', title: 'Grant Tracker', viewportW: 1280, viewportH: 800 },
        },
      ];
      const dataPins = encodeURIComponent(JSON.stringify({ version: 1, pins: serialized }));
      const html =
        '<p>Two things</p><p><strong>Pinned elements</strong></p>' +
        `<ol class="ai-app-element-pins" data-pins="${dataPins}">` +
        '<li><p><strong>Looks disabled until hover</strong></p><p><code>#review</code> · /pins</p></li>' +
        '<li><p><strong>(no note)</strong></p><p><code>#q</code> · /pins</p></li></ol>' +
        '<p><img src="https://cdn.example/crop-1.webp" alt="Pin 1: Looks disabled until hover" class="ai-app-pin-crop"></p>';
      return DOMPurify.sanitize(html);
    }

    it('recovers every pin from stored feedback, as prod, with its crop', () => {
      const { pins, skipped } = parsePinsFromFeedbackHtml(storedFeedback());
      expect(skipped).toBe(0);
      expect(pins).toHaveLength(2);
      expect(pins[0]).toEqual({
        n: 1,
        env: 'prod',
        pagePath: '/pins',
        pageQuery: null,
        selector: '#review',
        tag: 'button',
        text: 'Review now',
        role: null,
        ariaLabel: null,
        component: null,
        source: null,
        rect: { x: 10, y: 20, w: 80, h: 32 },
        viewportW: 1280,
        viewportH: 800,
        note: 'Looks disabled until hover',
        cropUrl: 'https://cdn.example/crop-1.webp',
      });
      expect(pins[1]).toMatchObject({ n: 2, selector: '#q', note: '', ariaLabel: 'Search grants', cropUrl: null });
    });

    it('returns nothing for feedback without pins', () => {
      expect(parsePinsFromFeedbackHtml('<p>Just words</p>')).toEqual({ pins: [], skipped: 0 });
    });

    it('counts an unreadable payload as skipped instead of throwing', () => {
      const html = '<ol class="ai-app-element-pins" data-pins="%E0%A4%A"><li>x</li></ol>';
      expect(parsePinsFromFeedbackHtml(html)).toEqual({ pins: [], skipped: 1 });
    });

    it('drops a pin that does not validate and keeps the rest', () => {
      const dataPins = encodeURIComponent(
        JSON.stringify({
          version: 1,
          pins: [
            {
              n: 1,
              note: '',
              selector: '',
              tag: 'div',
              rect: { x: 0, y: 0, w: 1, h: 1 },
              page: { path: '/', viewportW: 10, viewportH: 10 },
            },
            {
              n: 2,
              note: '',
              selector: '#ok',
              tag: 'div',
              text: '',
              rect: { x: 0, y: 0, w: 1, h: 1 },
              page: { path: '/', viewportW: 10, viewportH: 10 },
            },
          ],
        })
      );
      const { pins, skipped } = parsePinsFromFeedbackHtml(
        `<ol class="ai-app-element-pins" data-pins="${dataPins}"></ol>`
      );
      expect(skipped).toBe(1);
      expect(pins.map((pin) => pin.selector)).toEqual(['#ok']);
    });
  });
});

import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { LabosDigestEmailSettingsService } from './labos-digest-email-settings.service';
import { issueDigestLinkToken } from './labos-digest-link-token.util';
import { LabosDigestPublicController } from './labos-digest-public.controller';

jest.mock('./labos-digest-page.service', () => ({ LabosDigestPageService: class LabosDigestPageService {} }));

const SECRET = 'digest-email-settings-test-secret';
const DAY = 24 * 60 * 60 * 1000;

type Row = Record<string, unknown>;

/** The notification service's settings API: defaults for no row (digest off, daily), and a PUT that merges. */
class FakeNotificationService {
  rows = new Map<string, Row>();
  puts: Array<{ memberUid: string; body: Row }> = [];
  failNextPut = false;

  private defaults(memberUid: string): Row {
    return { memberUid, forumDigestEnabled: false, forumDigestFrequency: 1 };
  }

  async getNotificationSetting(memberUid: string) {
    return this.rows.get(memberUid) ?? this.defaults(memberUid);
  }

  async upsertNotificationSetting(memberUid: string, body: Row) {
    if (this.failNextPut) {
      this.failNextPut = false;
      throw new ServiceUnavailableException('notification service down');
    }
    this.puts.push({ memberUid, body });
    const row = { ...this.defaults(memberUid), ...(this.rows.get(memberUid) ?? {}), ...body, memberUid };
    this.rows.set(memberUid, row);
    return row;
  }
}

const members: Record<string, { uid: string; name: string | null; externalId: string | null }> = {
  ada: { uid: 'ada', name: 'Ada Lovelace', externalId: 'ext-ada' },
  grace: { uid: 'grace', name: null, externalId: null },
};

const prisma = {
  member: {
    findUnique: jest.fn(async ({ where }: { where: { uid: string } }) => members[where.uid] ?? null),
  },
};

const link = (m: string, issuedAt = Date.now()) =>
  issueDigestLinkToken({ m, f: 'daily', s: new Date(issuedAt).toISOString(), n: [], p: [] }, issuedAt);

describe('digest email settings from the signed link (LAB-3310)', () => {
  const originalSecret = process.env.DIGEST_LINK_SECRET;
  let notifications: FakeNotificationService;
  let controller: LabosDigestPublicController;

  beforeEach(() => {
    process.env.DIGEST_LINK_SECRET = SECRET;
    notifications = new FakeNotificationService();
    const service = new LabosDigestEmailSettingsService(prisma as any, notifications as any);
    controller = new LabosDigestPublicController({} as any, service);
  });

  afterAll(() => {
    process.env.DIGEST_LINK_SECRET = originalSecret;
  });

  describe('read', () => {
    it('returns the stored settings and changes nothing', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: true, forumDigestFrequency: 7 });
      await expect(controller.readEmailSettings({ token: link('ada') })).resolves.toEqual({
        firstName: 'Ada',
        enabled: true,
        frequency: 'weekly',
      });
      expect(notifications.puts).toEqual([]);
    });

    it('reads a member with no settings row as off and daily, the opt-in default', async () => {
      await expect(controller.readEmailSettings({ token: link('grace') })).resolves.toEqual({
        firstName: null,
        enabled: false,
        frequency: 'daily',
      });
      expect(notifications.rows.has('grace')).toBe(false);
    });

    it('reads a row without the digest flag as off', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: null, forumDigestFrequency: 7 });
      await expect(controller.readEmailSettings({ token: link('ada') })).resolves.toMatchObject({ enabled: false });
    });

    it('reads a frequency the email cannot offer as daily', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: true, forumDigestFrequency: 14 });
      await expect(controller.readEmailSettings({ token: link('ada') })).resolves.toMatchObject({ frequency: 'daily' });
    });
  });

  describe('change', () => {
    beforeEach(() => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: true, forumDigestFrequency: 7 });
    });

    it('unsubscribes, and Undo turns the digest back on with its frequency', async () => {
      await expect(controller.changeEmailSettings({ token: link('ada'), enabled: false })).resolves.toEqual({
        firstName: 'Ada',
        enabled: false,
        frequency: 'weekly',
      });
      expect(notifications.puts[0]).toEqual({
        memberUid: 'ada',
        body: { memberUid: 'ada', memberExternalId: 'ext-ada', forumDigestEnabled: false },
      });

      await expect(controller.changeEmailSettings({ token: link('ada'), enabled: true })).resolves.toEqual({
        firstName: 'Ada',
        enabled: true,
        frequency: 'weekly',
      });
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestEnabled: true, forumDigestFrequency: 7 });
    });

    it('switches the frequency and leaves on/off as it was', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: false, forumDigestFrequency: 1 });
      await expect(controller.changeEmailSettings({ token: link('ada'), frequency: 'weekly' })).resolves.toMatchObject({
        enabled: false,
        frequency: 'weekly',
      });
      expect(notifications.puts[0].body).not.toHaveProperty('forumDigestEnabled');
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestFrequency: 7 });
    });

    it('turns the digest on as daily when the stored frequency is one the email cannot offer', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: false, forumDigestFrequency: 14 });
      await expect(controller.changeEmailSettings({ token: link('ada'), enabled: true })).resolves.toMatchObject({
        enabled: true,
        frequency: 'daily',
      });
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestFrequency: 1 });
    });

    it('sends no external id for a member without one', async () => {
      await controller.changeEmailSettings({ token: link('grace'), enabled: true });
      expect(notifications.puts[0].body).not.toHaveProperty('memberExternalId');
      expect(notifications.rows.get('grace')).toMatchObject({ forumDigestEnabled: true, forumDigestFrequency: 1 });
    });

    it('returns 400 and changes nothing without enabled or frequency', async () => {
      await expect(controller.changeEmailSettings({ token: link('ada') })).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.changeEmailSettings({ token: link('ada'), frequency: 'monthly' })).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(notifications.puts).toEqual([]);
    });

    it("passes on the notification service's error and changes nothing", async () => {
      notifications.failNextPut = true;
      await expect(controller.changeEmailSettings({ token: link('ada'), enabled: false })).rejects.toBeInstanceOf(
        ServiceUnavailableException
      );
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestEnabled: true });
    });
  });

  describe('one-click unsubscribe (RFC 8058)', () => {
    it('is a POST that turns the digest off and answers with no body, also when already off', async () => {
      expect(Reflect.getMetadata(METHOD_METADATA, LabosDigestPublicController.prototype.unsubscribe)).toBe(
        RequestMethod.POST
      );
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: true, forumDigestFrequency: 7 });
      await expect(controller.unsubscribe(link('ada'))).resolves.toBeUndefined();
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestEnabled: false, forumDigestFrequency: 7 });
      await expect(controller.unsubscribe(link('ada'))).resolves.toBeUndefined();
      expect(notifications.rows.get('ada')).toMatchObject({ forumDigestEnabled: false });
    });

    it('returns 400 without a token', async () => {
      await expect(controller.unsubscribe(undefined)).rejects.toBeInstanceOf(BadRequestException);
      await expect(controller.unsubscribe(['a', 'b'])).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('a link that does not work', () => {
    const calls = (token: string) => [
      () => controller.readEmailSettings({ token }),
      () => controller.changeEmailSettings({ token, enabled: false }),
      () => controller.unsubscribe(token),
    ];

    const reasonOf = async (call: () => Promise<unknown>) => {
      const error = await call().then(
        () => null,
        (e) => e
      );
      return { type: error?.constructor, reason: error?.getResponse?.().reason };
    };

    it('returns 401 expired for a link older than 90 days, and changes nothing', async () => {
      notifications.rows.set('ada', { memberUid: 'ada', forumDigestEnabled: true, forumDigestFrequency: 7 });
      for (const call of calls(link('ada', Date.now() - 91 * DAY))) {
        await expect(reasonOf(call)).resolves.toEqual({ type: UnauthorizedException, reason: 'expired' });
      }
      expect(notifications.puts).toEqual([]);
    });

    it('returns 401 for a changed link', async () => {
      const [version, body, signature] = link('ada').split('.');
      const forged = `${version}.${body.slice(0, -2)}${body.slice(-2) === 'AA' ? 'AB' : 'AA'}.${signature}`;
      for (const call of calls(forged)) {
        await expect(reasonOf(call)).resolves.toEqual({ type: UnauthorizedException, reason: 'signature' });
      }
      expect(notifications.puts).toEqual([]);
    });

    it('returns 404 for a member who no longer exists', async () => {
      for (const call of calls(link('gone'))) {
        await expect(call()).rejects.toBeInstanceOf(NotFoundException);
      }
      expect(notifications.puts).toEqual([]);
    });

    it('returns 503 without DIGEST_LINK_SECRET', async () => {
      const token = link('ada');
      delete process.env.DIGEST_LINK_SECRET;
      for (const call of calls(token)) {
        await expect(call()).rejects.toBeInstanceOf(ServiceUnavailableException);
      }
      expect(notifications.puts).toEqual([]);
    });
  });
});

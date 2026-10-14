// The real analytics service pulls in the PostHog client; the controller only calls trackEvent on the instance.
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));

import { BadRequestException, Logger } from '@nestjs/common';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { JobMatchPublicController } from './job-match-public.controller';
import { issueSuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('JobMatchPublicController', () => {
  const env = { ...process.env };
  const memberFindUnique = jest.fn();
  const settingUpsert = jest.fn();
  const stored = new Map<string, boolean>();
  const settingFindUnique = jest.fn();
  const trackEvent = jest.fn();
  const prisma = {
    member: { findUnique: memberFindUnique },
    notificationSetting: { upsert: settingUpsert, findUnique: settingFindUnique },
  };
  const controller = new JobMatchPublicController(new SuggestedCandidatesEmailPreferenceService(prisma as never), {
    trackEvent,
  } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    stored.clear();
    process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET = 'test-secret';
    memberFindUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.uid === 'ghost' ? null : { uid: where.uid })
    );
    settingFindUnique.mockImplementation(({ where }) =>
      Promise.resolve(
        stored.has(where.memberUid) ? { suggestedCandidatesEmailEnabled: stored.get(where.memberUid) } : null
      )
    );
    trackEvent.mockResolvedValue(undefined);
    settingUpsert.mockImplementation(({ where, update }) => {
      stored.set(where.memberUid, update.suggestedCandidatesEmailEnabled);
      return Promise.resolve({ suggestedCandidatesEmailEnabled: update.suggestedCandidatesEmailEnabled });
    });
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it('turns the preference off for a valid token', async () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('m1', Date.now() - 10 * DAY_MS);
    await expect(controller.unsubscribe({ token })).resolves.toEqual({
      memberUid: 'm1',
      suggestedCandidatesEmailEnabled: false,
    });
    expect(stored.get('m1')).toBe(false);
  });

  it('answers 200 again when already off', async () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('m1');
    await controller.unsubscribe({ token });
    await expect(controller.unsubscribe({ token })).resolves.toEqual({
      memberUid: 'm1',
      suggestedCandidatesEmailEnabled: false,
    });
    expect(stored.get('m1')).toBe(false);
  });

  it('400s an expired token and changes nothing', async () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('m1', Date.now() - 91 * DAY_MS);
    await expect(controller.unsubscribe({ token })).rejects.toBeInstanceOf(BadRequestException);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it('400s a tampered token and changes nothing', async () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('m1');
    await expect(controller.unsubscribe({ token: `${token}x` })).rejects.toBeInstanceOf(BadRequestException);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it.each([[{}], [undefined], [{ token: '' }], [{ token: 42 }]])('400s body %p', async (body) => {
    await expect(controller.unsubscribe(body)).rejects.toBeInstanceOf(BadRequestException);
    expect(settingUpsert).not.toHaveBeenCalled();
  });

  it('400s a token for an unknown member', async () => {
    const token = issueSuggestedCandidatesUnsubscribeToken('ghost');
    await expect(controller.unsubscribe({ token })).rejects.toBeInstanceOf(BadRequestException);
    expect(settingUpsert).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  describe('analytics (LAB-2853)', () => {
    const unsubscribed = {
      name: 'suggested-candidates-email-unsubscribed',
      distinctId: 'm1',
      properties: { source: 'link' },
    };

    it('tracks suggested-candidates-email-unsubscribed once, when the link turns the email off', async () => {
      const token = issueSuggestedCandidatesUnsubscribeToken('m1');
      await controller.unsubscribe({ token });
      expect(trackEvent).toHaveBeenCalledTimes(1);
      expect(trackEvent).toHaveBeenCalledWith(unsubscribed);

      await controller.unsubscribe({ token });
      expect(trackEvent).toHaveBeenCalledTimes(1);
    });

    it('tracks a lead who had turned the email back on in settings', async () => {
      stored.set('m1', true);
      await controller.unsubscribe({ token: issueSuggestedCandidatesUnsubscribeToken('m1') });
      expect(trackEvent).toHaveBeenCalledWith(unsubscribed);
    });

    it('tracks nothing for a rejected token', async () => {
      const token = issueSuggestedCandidatesUnsubscribeToken('m1');
      await expect(controller.unsubscribe({ token: `${token}x` })).rejects.toBeInstanceOf(BadRequestException);
      expect(trackEvent).not.toHaveBeenCalled();
    });

    it('still unsubscribes when tracking throws or rejects, and logs the failure', async () => {
      const errorLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      trackEvent.mockImplementationOnce(() => {
        throw new Error('posthog exploded');
      });
      await expect(controller.unsubscribe({ token: issueSuggestedCandidatesUnsubscribeToken('m1') })).resolves.toEqual({
        memberUid: 'm1',
        suggestedCandidatesEmailEnabled: false,
      });
      trackEvent.mockRejectedValueOnce(new Error('posthog unreachable'));
      await expect(controller.unsubscribe({ token: issueSuggestedCandidatesUnsubscribeToken('m2') })).resolves.toEqual({
        memberUid: 'm2',
        suggestedCandidatesEmailEnabled: false,
      });
      await new Promise((resolve) => setImmediate(resolve));
      expect(stored.get('m1')).toBe(false);
      expect(stored.get('m2')).toBe(false);
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('posthog exploded'));
      expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('posthog unreachable'));
      errorLog.mockRestore();
    });
  });
});

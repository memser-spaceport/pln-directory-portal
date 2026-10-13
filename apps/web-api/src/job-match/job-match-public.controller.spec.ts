import { BadRequestException } from '@nestjs/common';
import { SuggestedCandidatesEmailPreferenceService } from '../notification-settings/suggested-candidates-email-preference.service';
import { JobMatchPublicController } from './job-match-public.controller';
import { issueSuggestedCandidatesUnsubscribeToken } from './suggested-candidates-token.util';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('JobMatchPublicController', () => {
  const env = { ...process.env };
  const memberFindUnique = jest.fn();
  const settingUpsert = jest.fn();
  const stored = new Map<string, boolean>();
  const prisma = {
    member: { findUnique: memberFindUnique },
    notificationSetting: { upsert: settingUpsert },
  };
  const controller = new JobMatchPublicController(new SuggestedCandidatesEmailPreferenceService(prisma as never));

  beforeEach(() => {
    jest.resetAllMocks();
    stored.clear();
    process.env.SUGGESTED_CANDIDATES_TOKEN_SECRET = 'test-secret';
    memberFindUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.uid === 'ghost' ? null : { uid: where.uid })
    );
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
  });
});

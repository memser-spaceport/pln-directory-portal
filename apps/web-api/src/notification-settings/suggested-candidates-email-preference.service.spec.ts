import { NotFoundException } from '@nestjs/common';
import { SuggestedCandidatesEmailPreferenceService } from './suggested-candidates-email-preference.service';

describe('SuggestedCandidatesEmailPreferenceService', () => {
  const settingFindUnique = jest.fn();
  const settingFindMany = jest.fn();
  const settingUpsert = jest.fn();
  const settingCreate = jest.fn();
  const memberFindUnique = jest.fn();
  const prisma = {
    notificationSetting: {
      findUnique: settingFindUnique,
      findMany: settingFindMany,
      upsert: settingUpsert,
      create: settingCreate,
    },
    member: { findUnique: memberFindUnique },
  };
  const service = new SuggestedCandidatesEmailPreferenceService(prisma as never);

  beforeEach(() => jest.resetAllMocks());

  describe('isEnabled', () => {
    it('is true for a member without a settings row, and creates none', async () => {
      settingFindUnique.mockResolvedValue(null);
      await expect(service.isEnabled('m1')).resolves.toBe(true);
      expect(settingCreate).not.toHaveBeenCalled();
      expect(settingUpsert).not.toHaveBeenCalled();
    });

    it('is false when stored false', async () => {
      settingFindUnique.mockResolvedValue({ suggestedCandidatesEmailEnabled: false });
      await expect(service.isEnabled('m1')).resolves.toBe(false);
    });

    it('is true when stored true', async () => {
      settingFindUnique.mockResolvedValue({ suggestedCandidatesEmailEnabled: true });
      await expect(service.isEnabled('m1')).resolves.toBe(true);
    });
  });

  describe('get', () => {
    it('returns the default for a known member without a row', async () => {
      memberFindUnique.mockResolvedValue({ uid: 'm1' });
      settingFindUnique.mockResolvedValue(null);
      await expect(service.get('m1')).resolves.toEqual({ memberUid: 'm1', suggestedCandidatesEmailEnabled: true });
      expect(settingCreate).not.toHaveBeenCalled();
    });

    it('404s for an unknown member', async () => {
      memberFindUnique.mockResolvedValue(null);
      await expect(service.get('ghost')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('enabledFor', () => {
    it('keeps members without a row and drops only stored opt-outs', async () => {
      settingFindMany.mockResolvedValue([{ memberUid: 'off' }]);
      const enabled = await service.enabledFor(['on', 'off', 'no-row', 'on']);
      expect([...enabled].sort()).toEqual(['no-row', 'on']);
      expect(settingFindMany).toHaveBeenCalledWith({
        where: { memberUid: { in: ['on', 'off', 'no-row'] }, suggestedCandidatesEmailEnabled: false },
        select: { memberUid: true },
      });
    });

    it('skips the query for an empty list', async () => {
      await expect(service.enabledFor([])).resolves.toEqual(new Set());
      expect(settingFindMany).not.toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('upserts the value for a known member', async () => {
      memberFindUnique.mockResolvedValue({ uid: 'm1' });
      settingUpsert.mockResolvedValue({ suggestedCandidatesEmailEnabled: false });
      await expect(service.set('m1', false)).resolves.toEqual({
        memberUid: 'm1',
        suggestedCandidatesEmailEnabled: false,
      });
      expect(settingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { memberUid: 'm1' },
          update: { suggestedCandidatesEmailEnabled: false },
          create: { memberUid: 'm1', suggestedCandidatesEmailEnabled: false },
        })
      );
    });

    it('404s for an unknown member and writes nothing', async () => {
      memberFindUnique.mockResolvedValue(null);
      await expect(service.set('ghost', true)).rejects.toBeInstanceOf(NotFoundException);
      expect(settingUpsert).not.toHaveBeenCalled();
    });
  });
  describe('unsubscribe', () => {
    beforeEach(() => {
      memberFindUnique.mockResolvedValue({ uid: 'm1' });
      settingUpsert.mockResolvedValue({ suggestedCandidatesEmailEnabled: false });
    });

    it.each([
      ['no row', null, true],
      ['stored on', { suggestedCandidatesEmailEnabled: true }, true],
      ['stored off', { suggestedCandidatesEmailEnabled: false }, false],
    ])('turns the email off and reports changed for %s', async (_label, row, changed) => {
      settingFindUnique.mockResolvedValue(row);
      await expect(service.unsubscribe('m1')).resolves.toEqual({ changed });
      expect(settingUpsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { memberUid: 'm1' }, update: { suggestedCandidatesEmailEnabled: false } })
      );
    });

    it('404s for an unknown member and writes nothing', async () => {
      memberFindUnique.mockResolvedValue(null);
      await expect(service.unsubscribe('ghost')).rejects.toBeInstanceOf(NotFoundException);
      expect(settingUpsert).not.toHaveBeenCalled();
    });
  });
});

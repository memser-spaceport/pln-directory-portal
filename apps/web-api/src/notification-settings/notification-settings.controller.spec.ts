// The session guard imports axios (ESM), which Jest cannot parse; it is not exercised here.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));
jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('./notification-settings.service', () => ({
  NotificationSettingsService: class NotificationSettingsService {},
}));
jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({
  AccessControlV2Service: class AccessControlV2Service {},
}));

// The controller types `@Req()` with the global `Request`, which this Jest environment does not define; the
// decorator metadata reads it at import time. Must run before the controller import below.
(globalThis as { Request?: unknown }).Request ??= class Request {};

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { NotificationSettingsResponseSchema } from 'libs/contracts/src/schema/notification-settings';
import { NotificationSettingsController } from './notification-settings.controller';
import { SuggestedCandidatesEmailPreferenceService } from './suggested-candidates-email-preference.service';

describe('NotificationSettingsController suggested-candidates email routes', () => {
  const findMemberFromEmail = jest.fn();
  const checkIfAdminUser = jest.fn();
  const memberFindUnique = jest.fn();
  const settingFindUnique = jest.fn();
  const settingUpsert = jest.fn();
  const prisma = {
    member: { findUnique: memberFindUnique },
    notificationSetting: { findUnique: settingFindUnique, upsert: settingUpsert },
  };
  const preference = new SuggestedCandidatesEmailPreferenceService(prisma as never);
  const controller = new NotificationSettingsController(
    {} as never,
    { findMemberFromEmail, checkIfAdminUser } as never,
    {} as never,
    {} as never,
    preference
  );
  const request = (email: string) => ({ userEmail: email } as never);

  beforeEach(() => {
    jest.resetAllMocks();
    memberFindUnique.mockImplementation(({ where }) =>
      Promise.resolve(where.uid === 'ghost' ? null : { uid: where.uid })
    );
    settingFindUnique.mockResolvedValue(null);
    settingUpsert.mockImplementation(({ create }) =>
      Promise.resolve({ suggestedCandidatesEmailEnabled: create.suggestedCandidatesEmailEnabled })
    );
  });

  const asSelf = () => {
    findMemberFromEmail.mockResolvedValue({ uid: 'm1' });
    checkIfAdminUser.mockReturnValue(false);
  };
  const asAdmin = () => {
    findMemberFromEmail.mockResolvedValue({ uid: 'admin' });
    checkIfAdminUser.mockReturnValue(true);
  };
  const asOther = () => {
    findMemberFromEmail.mockResolvedValue({ uid: 'm2' });
    checkIfAdminUser.mockReturnValue(false);
  };

  describe('GET', () => {
    it('returns the default for the member themself', async () => {
      asSelf();
      await expect(controller.getSuggestedCandidatesEmailSettings('m1', request('m1@x'))).resolves.toEqual({
        memberUid: 'm1',
        suggestedCandidatesEmailEnabled: true,
      });
    });

    it('lets an admin read another member', async () => {
      asAdmin();
      settingFindUnique.mockResolvedValue({ suggestedCandidatesEmailEnabled: false });
      await expect(controller.getSuggestedCandidatesEmailSettings('m1', request('a@x'))).resolves.toEqual({
        memberUid: 'm1',
        suggestedCandidatesEmailEnabled: false,
      });
    });

    it('403s another member', async () => {
      asOther();
      await expect(controller.getSuggestedCandidatesEmailSettings('m1', request('m2@x'))).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(settingFindUnique).not.toHaveBeenCalled();
    });

    it('404s an unknown member for an admin', async () => {
      asAdmin();
      await expect(controller.getSuggestedCandidatesEmailSettings('ghost', request('a@x'))).rejects.toBeInstanceOf(
        NotFoundException
      );
    });
  });

  describe('PUT', () => {
    it('lets the member turn it off', async () => {
      asSelf();
      await expect(
        controller.updateSuggestedCandidatesEmailSettings(
          'm1',
          { suggestedCandidatesEmailEnabled: false },
          request('m1@x')
        )
      ).resolves.toEqual({ memberUid: 'm1', suggestedCandidatesEmailEnabled: false });
      expect(settingUpsert).toHaveBeenCalledTimes(1);
    });

    it('lets an admin change another member', async () => {
      asAdmin();
      await expect(
        controller.updateSuggestedCandidatesEmailSettings(
          'm1',
          { suggestedCandidatesEmailEnabled: true },
          request('a@x')
        )
      ).resolves.toEqual({ memberUid: 'm1', suggestedCandidatesEmailEnabled: true });
    });

    it('403s another member and writes nothing', async () => {
      asOther();
      await expect(
        controller.updateSuggestedCandidatesEmailSettings(
          'm1',
          { suggestedCandidatesEmailEnabled: false },
          request('m2@x')
        )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(settingUpsert).not.toHaveBeenCalled();
    });

    it.each([[{ suggestedCandidatesEmailEnabled: 'no' }], [{}], [undefined]])('400s body %p', async (body) => {
      asSelf();
      await expect(
        controller.updateSuggestedCandidatesEmailSettings('m1', body, request('m1@x'))
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(settingUpsert).not.toHaveBeenCalled();
    });

    it('404s an unknown member', async () => {
      asAdmin();
      await expect(
        controller.updateSuggestedCandidatesEmailSettings(
          'ghost',
          { suggestedCandidatesEmailEnabled: false },
          request('a@x')
        )
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(settingUpsert).not.toHaveBeenCalled();
    });
  });

  describe('GET :memberUid full settings', () => {
    it('carries suggestedCandidatesEmailEnabled in the stored row type and the response schema', () => {
      // GET /v1/notification/settings/:memberUid returns the stored row; the column makes the field part of it.
      const stored: Pick<Prisma.NotificationSettingGetPayload<object>, 'suggestedCandidatesEmailEnabled'> = {
        suggestedCandidatesEmailEnabled: false,
      };
      const parsed = NotificationSettingsResponseSchema.parse({
        memberUid: 'm1',
        recommendationsEnabled: false,
        subscribed: false,
        exampleSent: false,
        exampleAttempts: 0,
        lastExampleSentAt: null,
        showInvitationDialog: true,
        emailFrequency: 14,
        byFocusArea: true,
        byRole: true,
        byFundingStage: true,
        byIndustryTag: true,
        focusAreaList: [],
        roleList: [],
        fundingStageList: [],
        industryTagList: [],
        ...stored,
      });
      expect(parsed.suggestedCandidatesEmailEnabled).toBe(false);
    });
  });
});

import { ForbiddenException } from '@nestjs/common';

import { MemberController } from './members.controller';

// The real services and guards pull in ES-module-only dependencies that this Jest setup cannot load.
jest.mock('./members.service', () => ({ MembersService: class {} }));
jest.mock('./investor-profile.service', () => ({ InvestorProfileService: class {} }));
jest.mock('../guards/user-token-validation.guard', () => ({ UserTokenValidation: class {} }));
jest.mock('../guards/auth.guard', () => ({ AuthGuard: class {} }));
jest.mock('../guards/user-access-token-validate.guard', () => ({ UserAccessTokenValidateGuard: class {} }));
jest.mock('../guards/user-token-check.guard', () => ({ OptionalUserTokenCheckGuard: class {} }));
jest.mock('../guards/service-auth.guard', () => ({ ServiceAuthGuard: class {} }));
jest.mock('../interceptors/verified-member.interceptor', () => ({ IsVerifiedMemberInterceptor: class {} }));

/** `isVerified` is admin-only, including boolean values (lodash `isEmpty(true)` is true). */
describe('MemberController — isVerified authorization', () => {
  const req = { userEmail: 'member@example.com' };

  function setup(isDirectoryAdmin: boolean) {
    const requestor = { uid: 'member-1', email: 'member@example.com', isDirectoryAdmin };
    const membersService = {
      findMemberByEmail: jest.fn().mockResolvedValue(requestor),
      checkIfAdminUser: jest.fn().mockReturnValue(isDirectoryAdmin),
      updateMemberFromParticipantsRequest: jest.fn().mockResolvedValue({ uid: 'member-1' }),
    };
    const logger = { info: jest.fn(), error: jest.fn() };
    return {
      membersService,
      controller: new MemberController(membersService as any, {} as any, logger as any, {} as any),
    };
  }

  const body = (isVerified: boolean) => ({
    participantType: 'MEMBER',
    newData: { email: 'x@example.com', isVerified },
  });

  it.each([true, false])('refuses a non-admin sending isVerified=%s', async (value) => {
    const { controller, membersService } = setup(false);

    await expect(controller.updateMember('member-1', body(value), req)).rejects.toBeInstanceOf(ForbiddenException);
    expect(membersService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
  });

  it('lets an admin send isVerified', async () => {
    const { controller, membersService } = setup(true);

    await controller.updateMember('member-1', body(true), req);

    expect(membersService.updateMemberFromParticipantsRequest).toHaveBeenCalled();
  });
});

import { BadRequestException, ForbiddenException } from '@nestjs/common';

import { MemberController } from './members.controller';

/**
 * Who may write which member record, on the two member update routes.
 * `PUT /v1/member/:uid` writes to the path uid, so ownership is checked on the
 * path uid. `PATCH /v1/members/:uid` passes its data to `prisma.member.update`,
 * so it accepts only the profile fields in `MemberSelfUpdateSchema`.
 */
describe('MemberController — member update authorization', () => {
  const MEMBER = { uid: 'member-1', email: 'member@example.com', isDirectoryAdmin: false };
  const ADMIN = { uid: 'admin-1', email: 'admin@example.com', isDirectoryAdmin: true };
  const req = { userEmail: 'requestor@example.com' };

  function setup(requestor: typeof MEMBER) {
    const membersService = {
      findMemberByEmail: jest.fn().mockResolvedValue(requestor),
      checkIfAdminUser: jest.fn().mockReturnValue(requestor.isDirectoryAdmin),
      updateMemberByUid: jest.fn().mockResolvedValue({ uid: 'member-1' }),
      updateMemberFromParticipantsRequest: jest.fn().mockResolvedValue({ uid: 'member-1' }),
    };
    const logger = { info: jest.fn(), error: jest.fn() };
    const controller = new MemberController(membersService as any, {} as any, logger as any);
    return { controller, membersService };
  }

  function participantsRequest(referenceUid: string | undefined, newData: Record<string, unknown> = {}) {
    return { participantType: 'MEMBER', referenceUid, newData: { email: 'x@example.com', ...newData } };
  }

  describe('PUT /v1/member/:uid', () => {
    it('lets a member update their own record', async () => {
      const { controller, membersService } = setup(MEMBER);

      await controller.updateMember('member-1', participantsRequest('member-1'), req);

      expect(membersService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
        'member-1',
        expect.anything(),
        MEMBER.email,
        false
      );
    });

    it("refuses a member writing another member's record, even with their own uid as referenceUid", async () => {
      const { controller, membersService } = setup(MEMBER);

      await expect(
        controller.updateMember('victim-1', participantsRequest('member-1', { email: 'attacker@example.com' }), req)
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(membersService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
    });

    it('refuses a referenceUid that does not match the path uid', async () => {
      const { controller, membersService } = setup(ADMIN);

      await expect(controller.updateMember('member-1', participantsRequest('member-2'), req)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(membersService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
    });

    it('refuses a non-MEMBER participant type', async () => {
      const { controller, membersService } = setup(MEMBER);

      await expect(
        controller.updateMember('member-1', { ...participantsRequest('member-1'), participantType: 'TEAM' }, req)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(membersService.updateMemberFromParticipantsRequest).not.toHaveBeenCalled();
    });

    it("lets a directory admin update another member's record", async () => {
      const { controller, membersService } = setup(ADMIN);

      await controller.updateMember('member-1', participantsRequest('member-1'), req);

      expect(membersService.updateMemberFromParticipantsRequest).toHaveBeenCalledWith(
        'member-1',
        expect.anything(),
        ADMIN.email,
        true
      );
    });
  });

  describe('PATCH /v1/members/:uid', () => {
    it('writes the allowed profile fields', async () => {
      const { controller, membersService } = setup(MEMBER);
      const body = {
        bio: '<p>Hi</p>',
        isSubscribedToNewsletter: true,
        officeHours: 'https://cal.com/me',
        ohInterest: ['Fundraising'],
        ohHelpWith: ['Hiring'],
      };

      await controller.updateMemberByUid('member-1', body, req);

      expect(membersService.updateMemberByUid).toHaveBeenCalledWith('member-1', body);
    });

    it("refuses a member writing another member's record", async () => {
      const { controller, membersService } = setup(MEMBER);

      await expect(controller.updateMemberByUid('member-2', { bio: 'x' }, req)).rejects.toBeInstanceOf(
        ForbiddenException
      );
      expect(membersService.updateMemberByUid).not.toHaveBeenCalled();
    });

    it.each([
      ['accessLevel', 'L6'],
      ['email', 'other@example.com'],
      ['externalId', 'someone-else'],
      ['isVerified', true],
      ['teamMemberRoles', { create: [] }],
    ])('refuses %s, which is not a self-editable field', async (field, value) => {
      const { controller, membersService } = setup(MEMBER);

      await expect(controller.updateMemberByUid('member-1', { bio: 'x', [field]: value }, req)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(membersService.updateMemberByUid).not.toHaveBeenCalled();
    });

    it('applies the same field list to directory admins', async () => {
      const { controller, membersService } = setup(ADMIN);

      await expect(controller.updateMemberByUid('member-1', { accessLevel: 'L6' }, req)).rejects.toBeInstanceOf(
        BadRequestException
      );
      expect(membersService.updateMemberByUid).not.toHaveBeenCalled();
    });

    it('refuses a wrongly typed allowed field', async () => {
      const { controller, membersService } = setup(MEMBER);

      await expect(
        controller.updateMemberByUid('member-1', { ohInterest: { set: ['x'] } }, req)
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(membersService.updateMemberByUid).not.toHaveBeenCalled();
    });
  });
});

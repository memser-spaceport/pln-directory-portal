import { BadRequestException } from '@nestjs/common';
import { JobSearchStatus } from '@prisma/client';

import { MemberController } from './members.controller';

/**
 * `PATCH /v1/members/:uid` passes its body straight to `prisma.member.update`,
 * so the wire value the API documents and returns has to be translated to the
 * enum the column stores before it gets there.
 *
 * `job-search-status.spec.ts` already covers the mapping helpers themselves.
 * What it could not catch — and what shipped broken — is the route not calling
 * them: every helper was correct in isolation while the write path never used
 * one, so the field could be read but never set. These tests assert the wiring
 * rather than the mapping.
 */
describe('MemberController — updateMemberByUid job search status', () => {
  const REQUESTOR = { uid: 'member-1', isDirectoryAdmin: false };

  function setup() {
    const updateMemberByUid = jest.fn().mockResolvedValue({ uid: 'member-1' });
    const membersService = {
      findMemberByEmail: jest.fn().mockResolvedValue(REQUESTOR),
      checkIfAdminUser: jest.fn().mockReturnValue(false),
      updateMemberByUid,
    };
    const logger = { info: jest.fn(), error: jest.fn() };
    const controller = new MemberController(membersService as any, {} as any, logger as any);

    return { controller, updateMemberByUid };
  }

  const req = { userEmail: 'member@example.com' };

  it('translates the documented wire value into the stored enum', async () => {
    const { controller, updateMemberByUid } = setup();

    await controller.updateMemberByUid('member-1', { jobSearchStatus: 'open-to-right-role' }, req);

    expect(updateMemberByUid).toHaveBeenCalledWith(
      'member-1',
      expect.objectContaining({ jobSearchStatus: JobSearchStatus.OPEN_TO_RIGHT_ROLE }),
    );
  });

  it.each([
    ['actively-looking', JobSearchStatus.ACTIVELY_LOOKING],
    ['open-to-right-role', JobSearchStatus.OPEN_TO_RIGHT_ROLE],
    ['not-looking', JobSearchStatus.NOT_LOOKING],
  ])('accepts %s', async (wire, prismaValue) => {
    const { controller, updateMemberByUid } = setup();

    await controller.updateMemberByUid('member-1', { jobSearchStatus: wire }, req);

    expect(updateMemberByUid.mock.calls[0][1].jobSearchStatus).toBe(prismaValue);
  });

  it('clears the status when sent null — the field is optional and must be unsettable', async () => {
    const { controller, updateMemberByUid } = setup();

    await controller.updateMemberByUid('member-1', { jobSearchStatus: null }, req);

    expect(updateMemberByUid.mock.calls[0][1].jobSearchStatus).toBeNull();
  });

  it('leaves the field alone when the patch does not mention it', async () => {
    const { controller, updateMemberByUid } = setup();

    await controller.updateMemberByUid('member-1', { bio: 'Just a bio edit' }, req);

    const payload = updateMemberByUid.mock.calls[0][1];
    expect('jobSearchStatus' in payload).toBe(false);
    expect(payload.bio).toBe('Just a bio edit');
  });

  it('rejects a value the column could never hold, rather than passing it to Prisma', async () => {
    const { controller, updateMemberByUid } = setup();

    await expect(controller.updateMemberByUid('member-1', { jobSearchStatus: 'nope' }, req)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMemberByUid).not.toHaveBeenCalled();
  });
});

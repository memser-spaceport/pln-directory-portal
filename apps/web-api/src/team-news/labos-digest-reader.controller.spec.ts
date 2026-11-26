import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { OptionalUserTokenCheckGuard } from '../guards/user-token-check.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LabosDigestReaderController } from './labos-digest-reader.controller';

// labos-digest.service pulls in the AI SDK, which ships ESM jest can't load; the page only needs this filter.
jest.mock('./labos-digest.service', () => ({ excludedTeamsWhere: () => null }));

jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({
  AccessControlV2Service: class AccessControlV2Service {},
}));

/** LAB-3356: the digest page by issue id. The session names the reader; the link token never does. */
function build(opts: { member?: { uid: string } | null; canReadForum?: boolean | 'error' } = {}) {
  const page = {
    readIssueByUid: jest.fn(async () => ({ ok: true })),
    chooseByIssue: jest.fn(async () => ({ newsItemUid: 'a', choice: 'more', changed: false })),
  };
  const members = {
    findMemberByEmail: jest.fn(async () => (opts.member === undefined ? { uid: 'reader' } : opts.member)),
  };
  const accessControl = {
    hasPermissionByEmail: jest.fn(async () => {
      if (opts.canReadForum === 'error') throw new Error('down');
      return { allowed: opts.canReadForum ?? false };
    }),
  };
  const controller = new LabosDigestReaderController(page as any, members as any, accessControl as any);
  return { controller, page, members, accessControl };
}

const guardsOf = (method: keyof LabosDigestReaderController) =>
  Reflect.getMetadata(GUARDS_METADATA, LabosDigestReaderController.prototype[method]);

describe('LabosDigestReaderController', () => {
  it('reads with an optional session and saves only with a valid one, per route', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, LabosDigestReaderController)).toBeUndefined();
    expect(guardsOf('readIssue')).toEqual([OptionalUserTokenCheckGuard]);
    expect(guardsOf('chooseOnIssue')).toEqual([UserTokenValidation]);
  });

  it('reads signed out as no viewer, without looking anyone up', async () => {
    const { controller, page, members } = build();
    await controller.readIssue({} as any, { issueUid: 'iss-1' });
    expect(page.readIssueByUid).toHaveBeenCalledWith('iss-1', null);
    expect(members.findMemberByEmail).not.toHaveBeenCalled();
  });

  it('reads signed in as that member, with forum access as the permission says', async () => {
    const { controller, page, accessControl } = build({ canReadForum: true });
    await controller.readIssue({ userEmail: 'grace@x.io' } as any, { issueUid: 'iss-1' });
    expect(accessControl.hasPermissionByEmail).toHaveBeenCalledWith('grace@x.io', 'forum.read');
    expect(page.readIssueByUid).toHaveBeenCalledWith('iss-1', { uid: 'reader', canReadForum: true });
  });

  it('keeps the forum locked when the permission check fails', async () => {
    const { controller, page } = build({ canReadForum: 'error' });
    await controller.readIssue({ userEmail: 'grace@x.io' } as any, { issueUid: 'iss-1' });
    expect(page.readIssueByUid).toHaveBeenCalledWith('iss-1', { uid: 'reader', canReadForum: false });
  });

  it('reads a session that is not a member as signed out', async () => {
    const { controller, page } = build({ member: null });
    await controller.readIssue({ userEmail: 'stranger@x.io' } as any, { issueUid: 'iss-1' });
    expect(page.readIssueByUid).toHaveBeenCalledWith('iss-1', null);
  });

  it('saves a choice for the signed-in member', async () => {
    const { controller, page } = build();
    await controller.chooseOnIssue({ userEmail: 'grace@x.io' } as any, {
      issueUid: 'iss-1',
      newsItemUid: 'a',
      choice: 'more',
    });
    expect(page.chooseByIssue).toHaveBeenCalledWith('iss-1', 'reader', 'a', 'more');
  });

  it('refuses a choice from a session that is not a member, and a bad body', async () => {
    const { controller, page } = build({ member: null });
    await expect(
      controller.chooseOnIssue({ userEmail: 'stranger@x.io' } as any, {
        issueUid: 'iss-1',
        newsItemUid: 'a',
        choice: 'more',
      })
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.chooseOnIssue({ userEmail: 'grace@x.io' } as any, {
        issueUid: 'iss-1',
        newsItemUid: 'a',
        choice: 'love',
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.readIssue({} as any, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(page.chooseByIssue).not.toHaveBeenCalled();
  });
});

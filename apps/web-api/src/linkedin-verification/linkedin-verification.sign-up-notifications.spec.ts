jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(JSON.stringify({ memberUid: 'member-1', redirectUrl: 'https://x.test/profile' })),
    del: jest.fn().mockResolvedValue(1),
    quit: jest.fn(),
  }))
);
jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({ data: { access_token: 'token' } }),
  get: jest.fn().mockResolvedValue({ data: { sub: 'linkedin-1' } }),
}));
jest.mock('../admin/member.service', () => ({ MemberService: class MemberService {} }));
jest.mock('../utils/aws/aws.service', () => ({ AwsService: class AwsService {} }));

import { MemberApprovalState } from '@prisma/client';
import { LinkedInVerificationService } from './linkedin-verification.service';

describe('LinkedInVerificationService sign-up notifications', () => {
  let updateMemberApprovalState: jest.Mock;
  let notifyLinkedInVerified: jest.Mock;
  let sendEmailWithTemplate: jest.Mock;

  const buildService = (state: MemberApprovalState) => {
    const prisma = {
      member: {
        findUnique: jest.fn().mockResolvedValue({
          uid: 'member-1',
          name: 'Ada',
          email: 'ada@example.com',
          linkedinHandler: 'ada',
          memberApproval: { state },
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      linkedInProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({ linkedinProfileId: 'linkedin-1', linkedinHandler: 'ada' }),
      },
    };
    return new LinkedInVerificationService(
      prisma as never,
      { info: jest.fn(), error: jest.fn() } as never,
      { updateMemberApprovalState } as never,
      { sendEmailWithTemplate } as never,
      { notifyLinkedInVerified } as never
    );
  };

  beforeEach(() => {
    updateMemberApprovalState = jest.fn().mockResolvedValue({ updated: true });
    notifyLinkedInVerified = jest.fn().mockResolvedValue(undefined);
    sendEmailWithTemplate = jest.fn().mockResolvedValue({ MessageId: 'email-1' });
  });

  it('posts when a pending member becomes verified', async () => {
    await buildService(MemberApprovalState.PENDING).handleLinkedInCallback({ code: 'code', state: 'state' });

    expect(notifyLinkedInVerified).toHaveBeenCalledWith('member-1');
  });

  it('posts even when the admin email fails', async () => {
    sendEmailWithTemplate.mockRejectedValue(new Error('SES down'));

    await buildService(MemberApprovalState.PENDING).handleLinkedInCallback({ code: 'code', state: 'state' });

    expect(notifyLinkedInVerified).toHaveBeenCalledWith('member-1');
  });

  it('does not post when the approval state did not change', async () => {
    updateMemberApprovalState.mockResolvedValue({ updated: false });

    await buildService(MemberApprovalState.PENDING).handleLinkedInCallback({ code: 'code', state: 'state' });

    expect(notifyLinkedInVerified).not.toHaveBeenCalled();
  });

  it('does not post for an approved member', async () => {
    await buildService(MemberApprovalState.APPROVED).handleLinkedInCallback({ code: 'code', state: 'state' });

    expect(updateMemberApprovalState).not.toHaveBeenCalled();
    expect(notifyLinkedInVerified).not.toHaveBeenCalled();
  });
});

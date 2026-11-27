// The session guard imports axios, which ships ESM; it is only compared by identity here.
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn() } }));

import { ForbiddenException, InternalServerErrorException, RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Prisma } from '@prisma/client';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { MemberInvitesController } from './member-invites.controller';
import { MemberInvitesService, buildSignUpUrl, newInviteCode } from './member-invites.service';

// LAB-3396 first slice: GET /v1/members/me/invite-link → { inviteCode, inviteUrl }.

const unique = (target: string) =>
  new Prisma.PrismaClientKnownRequestError('Unique', 'P2002', '4.4.0', { target: [target] });

describe('MemberInvites (LAB-3396)', () => {
  const member = { findUnique: jest.fn() };
  const memberInviteCode = { findUnique: jest.fn(), create: jest.fn() };
  const service = new MemberInvitesService({ member, memberInviteCode } as never);
  const get = (email: string | undefined = 'Ada@Protocol.ai ') => service.getMyInviteLink(email);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.WEB_UI_BASE_URL = 'https://os.pl.xyz';
    member.findUnique.mockImplementation(async ({ where }) => ({
      uid: `m-${where.email}`,
      deletedAt: null,
      accessLevel: 'L1',
    }));
    memberInviteCode.findUnique.mockResolvedValue(null);
    memberInviteCode.create.mockImplementation(async ({ data }) => ({ code: data.code }));
  });

  it('is GET /v1/members/me/invite-link behind the member session guard, never cached', () => {
    const handler = MemberInvitesController.prototype.getMyInviteLink;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('/v1/members/me/invite-link');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual([UserTokenValidation]);
    expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
      { name: 'Cache-Control', value: 'private, no-store' },
    ]);
  });

  it('makes one code for the session member and returns the standard sign-up URL', async () => {
    const link = await get();
    expect(member.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: 'ada@protocol.ai' } }));
    expect(memberInviteCode.create).toHaveBeenCalledWith({
      data: { memberUid: 'm-ada@protocol.ai', code: link.inviteCode },
      select: { code: true },
    });
    expect(link.inviteCode).toMatch(/^[A-Za-z0-9_-]{12}$/);
    expect(link.inviteUrl).toBe(`https://os.pl.xyz/sign-up?invite=${link.inviteCode}`);
  });

  it('reuses the stored code on each request', async () => {
    memberInviteCode.findUnique.mockResolvedValue({ code: 'a b+c' });
    await expect(get()).resolves.toEqual({
      inviteCode: 'a b+c',
      inviteUrl: 'https://os.pl.xyz/sign-up?invite=a+b%2Bc',
    });
    expect(memberInviteCode.create).not.toHaveBeenCalled();
  });

  it('gives different members different codes', async () => {
    const [a, b] = await Promise.all([get('a@x.io'), get('b@x.io')]);
    expect(a.inviteCode).not.toBe(b.inviteCode);
    expect(memberInviteCode.create.mock.calls.map(([arg]) => arg.data.memberUid)).toEqual(['m-a@x.io', 'm-b@x.io']);
  });

  it('returns the winner code when a parallel first request wins the member constraint', async () => {
    memberInviteCode.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ code: 'winner' });
    memberInviteCode.create.mockRejectedValueOnce(unique('memberUid'));
    await expect(get()).resolves.toMatchObject({ inviteCode: 'winner' });
    expect(memberInviteCode.create).toHaveBeenCalledTimes(1);
  });

  it('tries a new code after a random code clash, and stops after 3 tries', async () => {
    memberInviteCode.create.mockRejectedValueOnce(unique('code'));
    await expect(get()).resolves.toHaveProperty('inviteCode');
    expect(memberInviteCode.create).toHaveBeenCalledTimes(2);

    memberInviteCode.create.mockRejectedValue(unique('code'));
    await expect(get()).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('passes on other database errors', async () => {
    memberInviteCode.create.mockRejectedValue(new Error('db down'));
    await expect(get()).rejects.toThrow('db down');
  });

  it.each([
    ['no session email', undefined, null],
    ['no member', 'x@y.io', null],
    ['a deleted member', 'x@y.io', { uid: 'm', deletedAt: new Date(), accessLevel: 'L1' }],
    ['a rejected member', 'x@y.io', { uid: 'm', deletedAt: null, accessLevel: 'Rejected' }],
  ])('answers 403 with no write for %s', async (_label, email, found) => {
    member.findUnique.mockResolvedValue(found);
    await expect(service.getMyInviteLink(email as string | undefined)).rejects.toBeInstanceOf(ForbiddenException);
    expect(memberInviteCode.create).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'not a url', 'ftp://os.pl.xyz', 'javascript:alert(1)'])(
    'answers 500 with no database call when WEB_UI_BASE_URL is %p',
    async (base) => {
      if (base === undefined) delete process.env.WEB_UI_BASE_URL;
      else process.env.WEB_UI_BASE_URL = base;
      await expect(get()).rejects.toBeInstanceOf(InternalServerErrorException);
      expect(member.findUnique).not.toHaveBeenCalled();
      expect(memberInviteCode.create).not.toHaveBeenCalled();
    }
  );

  it('builds the URL on the configured origin only', () => {
    expect(buildSignUpUrl('http://localhost:4200/any/path').toString()).toBe('http://localhost:4200/sign-up');
    expect(new Set(Array.from({ length: 50 }, newInviteCode)).size).toBe(50);
  });
});

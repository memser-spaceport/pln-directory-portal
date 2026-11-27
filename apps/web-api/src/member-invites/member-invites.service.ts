import { ForbiddenException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { MemberInviteLink } from 'libs/contracts/src/schema/member-invite';
import { PrismaService } from '../shared/prisma.service';

/** The invite link opens standard sign-up. The code is public: it names the inviter, not a session. */
export const INVITE_SIGN_UP_PATH = '/sign-up';
const CODE_ATTEMPTS = 3;

/** 72 random bits as 12 URL-safe characters. */
export const newInviteCode = (): string => randomBytes(9).toString('base64url');

/** The sign-up URL on the configured web app. It throws before any database write if the base URL is not absolute http(s). */
export function buildSignUpUrl(baseUrl: string | undefined): URL {
  let url: URL | undefined;
  try {
    url = baseUrl ? new URL(INVITE_SIGN_UP_PATH, baseUrl) : undefined;
  } catch {
    url = undefined;
  }
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
    throw new InternalServerErrorException('The invite link is not available');
  }
  return url;
}

const uniqueTarget = (error: unknown): string[] =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    ? ([] as string[]).concat((error.meta?.target as string[] | string | undefined) ?? [])
    : [];

@Injectable()
export class MemberInvitesService {
  constructor(private readonly prisma: PrismaService) {}

  async getMyInviteLink(email: string | undefined): Promise<MemberInviteLink> {
    const url = buildSignUpUrl(process.env.WEB_UI_BASE_URL);
    const memberUid = await this.resolveMemberUid(email);
    const inviteCode = await this.getOrCreateCode(memberUid);
    url.searchParams.set('invite', inviteCode);
    return { inviteCode, inviteUrl: url.toString() };
  }

  private async resolveMemberUid(email: string | undefined): Promise<string> {
    const member = email
      ? await this.prisma.member.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: { uid: true, deletedAt: true, accessLevel: true },
        })
      : null;
    // Same rule as the session lookup in member-signals, and a rejected member gets no link.
    if (!member || member.deletedAt || member.accessLevel === 'Rejected')
      throw new ForbiddenException('Member not found');
    return member.uid;
  }

  /** One code per member, made on the first request. A parallel first request reads the row that won. */
  private async getOrCreateCode(memberUid: string): Promise<string> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const existing = await this.prisma.memberInviteCode.findUnique({ where: { memberUid }, select: { code: true } });
      if (existing) return existing.code;
      try {
        const created = await this.prisma.memberInviteCode.create({
          data: { memberUid, code: newInviteCode() },
          select: { code: true },
        });
        return created.code;
      } catch (error) {
        const target = uniqueTarget(error);
        // memberUid: another request made this member's code; read it. code: a random clash; try a new code.
        if (!target.includes('memberUid') && !target.includes('code')) throw error;
      }
    }
    throw new InternalServerErrorException('The invite link is not available');
  }
}

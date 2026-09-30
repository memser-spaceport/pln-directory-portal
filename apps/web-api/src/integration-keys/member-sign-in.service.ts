import { BadRequestException, CACHE_MANAGER, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../shared/prisma.service';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';

const CODE_TTL_SECONDS = 60;

function codeKey(code: string): string {
  const env = process.env.ENVIRONMENT ?? 'local';
  return `${env}:member-sign-in-code:${createHash('sha256').update(code).digest('hex')}`;
}

export interface SignedInMember {
  memberUid: string;
  name: string;
  email: string | null;
  image: string | null;
  permissions: string[];
}

/**
 * Sign-in for first-party apps outside LabOS's own host (the ATS). LabOS no longer shares `authToken` with other
 * hosts (LAB-2695), so LabOS mints a one-time code for the signed-in member and the app's server redeems it with its
 * integration key. The member's LabOS token never leaves LabOS.
 */
@Injectable()
export class MemberSignInService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessControl: AccessControlV2Service,
    @Inject(CACHE_MANAGER) private readonly cache: Cache
  ) {}

  async issueCode(email: string): Promise<{ code: string }> {
    const member = await this.prisma.member.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { uid: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    const code = randomBytes(32).toString('base64url');
    await this.cache.set(codeKey(code), member.uid, { ttl: CODE_TTL_SECONDS });
    return { code };
  }

  async redeem(code: string): Promise<SignedInMember> {
    const key = codeKey(code);
    const memberUid = await this.cache.get<string>(key);
    if (!memberUid) throw new BadRequestException('Invalid or expired sign-in code');
    await this.cache.del(key);
    return this.member(memberUid);
  }

  async member(memberUid: string): Promise<SignedInMember> {
    const member = await this.prisma.member.findUnique({
      where: { uid: memberUid },
      select: { uid: true, name: true, email: true, image: { select: { url: true } } },
    });
    if (!member) throw new NotFoundException('Member not found');
    const access = await this.accessControl.getMemberAccess(member.uid);
    return {
      memberUid: member.uid,
      name: member.name,
      email: member.email,
      image: member.image?.url ?? null,
      permissions: access.effectivePermissions,
    };
  }
}

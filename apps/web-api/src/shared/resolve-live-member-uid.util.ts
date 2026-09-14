import { PrismaService } from './prisma.service';

/**
 * Resolves an email to a live (non-deleted) member's uid, or `undefined` for an
 * anonymous, unknown, or soft-deleted member. Tolerant on purpose: callers use
 * this to attach viewer context (interest stamps, auth context, …) to an
 * otherwise-public read, where "no viewer context" is the correct outcome
 * rather than an error.
 */
export async function resolveLiveMemberUidByEmail(prisma: PrismaService, email?: string): Promise<string | undefined> {
  if (!email) return undefined;
  const member = await prisma.member.findUnique({
    where: { email },
    select: { uid: true, deletedAt: true },
  });
  if (!member || member.deletedAt) return undefined;
  return member.uid;
}

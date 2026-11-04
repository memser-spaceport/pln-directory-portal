/**
 * Members whose actions are never recorded and who never get an interest
 * profile: the trending-seed bots and test accounts. Shared by the signal
 * writer, the signal backfill and the profile build.
 */
export const BOT_SIGN_UP_SOURCE = 'system-trending-seed';

/** Email domains of test accounts. Reviewed by a human; extend here. */
export const TEST_ACCOUNT_EMAIL_DOMAINS: readonly string[] = ['yopmail.com'];

export type ExclusionFields = { signUpSource?: string | null; email?: string | null };

export function isExcludedMember(member: ExclusionFields | null | undefined): boolean {
  if (!member) return true;
  if (member.signUpSource === BOT_SIGN_UP_SOURCE) return true;
  const domain = member.email?.split('@')[1]?.trim().toLowerCase();
  return !!domain && TEST_ACCOUNT_EMAIL_DOMAINS.includes(domain);
}

/**
 * The same rule as a Prisma `Member` filter, for bulk reads (backfill, profile
 * build). `email` is nullable, so the domain test is wrapped to keep members
 * without an email.
 */
export function excludedMemberWhereNot() {
  return {
    OR: [
      { signUpSource: BOT_SIGN_UP_SOURCE },
      ...TEST_ACCOUNT_EMAIL_DOMAINS.map((domain) => ({
        email: { endsWith: `@${domain}`, mode: 'insensitive' as const },
      })),
    ],
  };
}

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
 * The same rule as a Prisma `Member` filter, for bulk reads: use it as
 * `NOT: excludedMemberWhere()`. Each branch pairs its test with `not: null`,
 * because SQL `NOT (col = x)` is NULL, not true, for a NULL column, and would
 * silently drop every member without a sign-up source or email.
 */
export function excludedMemberWhere() {
  return {
    OR: [
      { AND: [{ signUpSource: { not: null } }, { signUpSource: BOT_SIGN_UP_SOURCE }] },
      ...TEST_ACCOUNT_EMAIL_DOMAINS.map((domain) => ({
        AND: [{ email: { not: null } }, { email: { endsWith: `@${domain}`, mode: 'insensitive' as const } }],
      })),
    ],
  };
}

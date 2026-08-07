/** Contact / PII fields that must not be returned to unauthenticated callers. */
export const MEMBER_CONTACT_FIELDS = [
  'email',
  'githubHandler',
  'discordHandler',
  'telegramHandler',
  'telegramUid',
  'twitterHandler',
  'linkedinHandler',
] as const;

type MemberLike = Record<string, unknown>;

function stripContacts(member: MemberLike): MemberLike {
  const sanitized: MemberLike = { ...member };
  for (const field of MEMBER_CONTACT_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = null;
    }
  }
  return sanitized;
}

/**
 * Strips contact PII from member payloads when the caller is not authenticated.
 * Authenticated callers receive full contact fields; portal-v2 still applies
 * preference-based hiding for non-owners.
 */
export function sanitizeMemberContactsForViewer<T>(member: T, isAuthenticated: boolean): T {
  if (isAuthenticated || member == null || typeof member !== 'object') {
    return member;
  }
  return stripContacts(member as MemberLike) as T;
}

export function sanitizeMembersContactsForViewer<T>(members: T[], isAuthenticated: boolean): T[] {
  if (isAuthenticated || !Array.isArray(members)) {
    return members;
  }
  return members.map((member) => sanitizeMemberContactsForViewer(member, false));
}

export function isRequestAuthenticated(request: { userEmail?: string }): boolean {
  return Boolean(request?.userEmail);
}

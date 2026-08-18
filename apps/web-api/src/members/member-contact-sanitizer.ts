/** Contact / PII fields that must not be returned to unauthenticated callers. */
export const MEMBER_CONTACT_FIELDS = [
  'email',
  'githubHandler',
  'discordHandler',
  'telegramHandler',
  'telegramUid',
  'twitterHandler',
  'linkedinHandler',
  'blueskyHandler',
  'officeHours',
] as const;

/** Non-contact but still private fields that must not be returned to unauthenticated callers. */
export const MEMBER_PRIVATE_FIELDS = [
  'preferences',
  'linkedInDetails',
  'moreDetails',
  'aboutYou',
  'accessLevel',
] as const;

/** `linkedinProfile` carries `profileData` + `linkedinHandler` and is nulled wholesale. */
const MEMBER_OBJECT_FIELDS = ['linkedinProfile'] as const;

const MEMBER_MARKER_FIELDS = [...MEMBER_CONTACT_FIELDS, ...MEMBER_PRIVATE_FIELDS, ...MEMBER_OBJECT_FIELDS] as const;

type MemberLike = Record<string, unknown>;

function isPlainObject(value: unknown): value is MemberLike {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function isMemberLike(value: MemberLike): boolean {
  return MEMBER_MARKER_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

function stripContacts(member: MemberLike): MemberLike {
  const sanitized: MemberLike = { ...member };
  for (const field of MEMBER_CONTACT_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = null;
    }
  }
  for (const field of MEMBER_PRIVATE_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = null;
    }
  }
  for (const field of MEMBER_OBJECT_FIELDS) {
    if (field in sanitized) {
      sanitized[field] = null;
    }
  }
  return sanitized;
}

/**
 * Walks the payload and strips contact/private fields from every member-like
 * object it finds (top-level or nested behind any relation), so callers don't
 * need to know where a `member` relation is attached (`teamMemberRoles[].member`,
 * `creator`, `closedBy`, subscription `member`, `eventGuests[].member`, ...).
 * Only plain objects/arrays are walked — Dates, Decimals, Buffers, etc. are
 * returned as-is so their serialization isn't disturbed.
 */
function sanitizeNode(value: unknown, seen: WeakSet<object>): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeNode(item, seen));
  }
  if (!isPlainObject(value)) {
    return value;
  }
  if (seen.has(value)) {
    return value;
  }
  seen.add(value);

  const node = isMemberLike(value) ? stripContacts(value) : { ...value };
  for (const key of Object.keys(node)) {
    node[key] = sanitizeNode(node[key], seen);
  }
  return node;
}

/**
 * Strips contact/private PII from member payloads when the caller is not authenticated.
 * Authenticated callers receive full contact fields; portal-v2 still applies
 * preference-based hiding for non-owners.
 */
export function sanitizeMemberContactsForViewer<T>(member: T, isAuthenticated: boolean): T {
  if (isAuthenticated || member == null || typeof member !== 'object') {
    return member;
  }
  return sanitizeNode(member, new WeakSet()) as T;
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

const CONTACT_FIELDS = ['email', 'telegramHandler', 'telegramUid', 'linkedinHandler'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function hasContactDetail(row: Record<string, unknown>): boolean {
  return CONTACT_FIELDS.some((field) => {
    const value = row[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/**
 * Members in an MCP payload who have an email, Telegram, or LinkedIn value.
 * The same uid counts once. A page with no contact values counts as zero.
 */
export function countContactMembers(value: unknown): number {
  const seen = new Set<string>();
  let anonymous = 0;

  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (!isPlainObject(node)) return;
    if (hasContactDetail(node)) {
      const uid = typeof node.uid === 'string' ? node.uid : '';
      if (uid) {
        if (!seen.has(uid)) seen.add(uid);
      } else {
        anonymous += 1;
      }
    }
    for (const child of Object.values(node)) walk(child);
  };

  walk(value);
  return seen.size + anonymous;
}

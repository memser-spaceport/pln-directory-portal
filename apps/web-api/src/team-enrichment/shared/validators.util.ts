/**
 * Shape validators shared between the field-shape gate (judgability) and the
 * quality scorer (validity dimension). Structural checks only — they don't
 * verify content, only that the value LOOKS like the right kind of thing.
 */

export function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(v.trim());
}

export function looksLikeEmail(v: string): boolean {
  return /@/.test(v) && !v.startsWith('http');
}

export function emailDomain(value: string): string | null {
  const m = value.trim().toLowerCase().match(/^[^\s@]+@([^\s@]+)$/);
  return m ? m[1] : null;
}

/**
 * Consumer email providers — addresses here are almost never a team's
 * canonical contact channel. Used by the judge's stale-user-recovery pass to
 * flag `contactMethod` values that look personal (e.g. team lead's own
 * `jane@gmail.com` pasted into the team slot). Not exhaustive; covers the
 * dominant providers seen in the portal's existing data + their common
 * regional variants. Adding more is safe — false positives at worst trigger
 * an extra AI re-discovery call, which is bounded by the recovery flag.
 */
export const FREE_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.uk',
  'yahoo.fr',
  'yahoo.de',
  'yahoo.es',
  'yahoo.it',
  'ymail.com',
  'hotmail.com',
  'hotmail.co.uk',
  'hotmail.fr',
  'hotmail.de',
  'outlook.com',
  'outlook.fr',
  'outlook.de',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'protonmail.com',
  'proton.me',
  'pm.me',
  'fastmail.com',
  'fastmail.fm',
  'gmx.com',
  'gmx.net',
  'gmx.de',
  'aol.com',
  'mail.com',
  'yandex.ru',
  'yandex.com',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'naver.com',
  'tutanota.com',
  'zoho.com',
]);

/**
 * True when `value` is shaped like an email at a known consumer provider AND
 * is NOT already on the team-lead Member list (which Stage 1.5's
 * `founder contact match` rule would have auto-promoted at agrees+high).
 *
 * The exclusion clause is important: a pre-seed team that registered the
 * founder's `jane@gmail.com` as a TeamMemberRole lead has a legitimate
 * team-contact use of that address — see [[stage-15-rule-index]] in
 * docs/TEAM_ENRICHMENT.md. Recovery should only fire on consumer-provider
 * addresses that don't even map to a registered founder, i.e. the "random
 * personal email pasted into the team slot" case.
 *
 * `teamLeadEmails` is expected pre-normalized (lowercased, trimmed) — the
 * existing `collectLeadContacts` helper produces them that way.
 */
export function isLikelyPersonalContactEmail(
  value: string | null | undefined,
  teamLeadEmails: ReadonlySet<string>
): boolean {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim().toLowerCase();
  if (!isEmail(trimmed)) return false;
  const domain = emailDomain(trimmed);
  if (!domain) return false;
  if (!FREE_EMAIL_DOMAINS.has(domain)) return false;
  if (teamLeadEmails.has(trimmed)) return false;
  return true;
}

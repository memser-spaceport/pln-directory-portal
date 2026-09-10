/**
 * Normalizes the "Refer someone outside the network" LinkedIn field, which accepts either a
 * bare handle (`johndoe`) or a full profile URL (`https://linkedin.com/in/johndoe`, with or
 * without the scheme, and with or without the `in/` segment), into a URL usable as the
 * referral email's profile link.
 */
export function normalizeExternalLinkedinUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const handle = trimmed
    .replace(/^(?:www\.)?linkedin\.com\//i, '')
    .replace(/^in\//i, '')
    .replace(/^\/+|\/+$/g, '');
  return `https://www.linkedin.com/in/${handle}`;
}

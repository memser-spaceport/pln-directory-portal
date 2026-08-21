/**
 * Normalizes a Bluesky handle to its bare form, following the same rules used
 * for the existing X/Twitter, Telegram, and LinkedIn handlers (see
 * InvestorBulkProvisionService): strip a leading `@`, then extract the handle
 * out of a bsky.app profile URL if one was pasted in.
 *
 * Accepts: `@handle`, `handle`, `https://bsky.app/profile/handle`, `bsky.app/profile/handle`.
 */
export function normalizeBlueskyHandler(handler?: string | null): string | undefined {
  if (!handler) return undefined;

  let normalized = handler.trim().replace(/^@/, '');
  const blueskyUrlMatch = normalized.match(/(?:https?:\/\/)?(?:www\.)?bsky\.app\/profile\/([a-zA-Z0-9._-]+)/i);
  if (blueskyUrlMatch) {
    normalized = blueskyUrlMatch[1];
  }

  return normalized || undefined;
}

/**
 * Normalizes a Crunchbase reference to the bare organization slug, following
 * the same rules used for the existing social handlers: extract the slug out
 * of a full Crunchbase URL or an `organization/<slug>` path, otherwise pass
 * the trimmed value through as-is.
 *
 * Accepts: `slug`, `organization/slug`, `https://www.crunchbase.com/organization/slug`,
 * `crunchbase.com/organization/slug`.
 */
export function normalizeCrunchbaseHandler(handler?: string | null): string | undefined {
  if (!handler) return undefined;

  let normalized = handler.trim().replace(/^@/, '');
  const crunchbaseUrlMatch = normalized.match(
    /(?:https?:\/\/)?(?:www\.)?crunchbase\.com\/organization\/([a-zA-Z0-9-]+)/i
  );
  if (crunchbaseUrlMatch) {
    normalized = crunchbaseUrlMatch[1];
  } else {
    normalized = normalized.replace(/^organization\//i, '');
  }

  return normalized || undefined;
}

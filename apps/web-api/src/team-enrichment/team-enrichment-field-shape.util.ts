/**
 * Per-field shape validators.
 *
 * The judge's value-validity gate previously skipped only URL-required fields
 * (`website`, `blog`) when the value didn't parse as a URL — that caught
 * placeholders like "Coming soon!" or "n/a" on those two fields and stopped
 * the AI from fabricating verdicts against junk input.
 *
 * Other fields had no shape check, so a user who typed "email" / "Twitter" /
 * "Telegram" as their `contactMethod` (the literal field label) got judged
 * anyway, lingered in the admin review queue, and wasted reviewer time.
 *
 * This file generalizes the same idea per field. Each validator rejects values
 * that can't possibly be the right kind of thing for the field, without
 * maintaining an explicit placeholder blocklist — placeholder phrases like
 * "Coming soon!", "n/a", "TBD" simply fail the structural check.
 *
 * NOT a content-validity check. A value that PASSES the shape check is just
 * "structurally plausible" — the AI judge and corroboration rules still verify
 * it points at the right entity.
 */

import { FieldMetaKey } from './team-enrichment.types';

// URL with explicit http/https scheme + a host that contains at least one dot.
// Rejects schemeless "t54.ai" and free text like "Coming soon!".
const URL_WITH_SCHEME = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s/$.?#][^\s]*$/i;

// Standard email shape (one @, host with at least one dot).
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

// mailto: links.
const MAILTO_SHAPE = /^mailto:[^\s@]+@[^\s@.]+\.[^\s@]+/i;

// `@handle` form (Discord/Telegram/Twitter etc., minimum 2 chars to avoid
// catching stray "@" or "@a").
const AT_HANDLE = /^@[A-Za-z0-9_]{2,}$/;

// Twitter/X: up to 15 alphanumeric/underscore chars. Spec hard-codes the max.
const TWITTER_HANDLE_BARE = /^[A-Za-z0-9_]{1,15}$/;

// Telegram: 5-32 chars per their docs, but profiles ≥3 chars exist in our
// corpus (e.g. `EFF`). Keep 3-32 to match the existing extractor regex.
const TELEGRAM_HANDLE_BARE = /^[A-Za-z0-9_]{3,32}$/;

// LinkedIn slug after stripping `https://www.linkedin.com/` and trailing `/`.
// Accepts `company/<slug>`, `school/<slug>`, `in/<slug>`, or bare `<slug>`.
const LINKEDIN_SLUG = /^(?:company|school|in)\/[A-Za-z0-9_.-]{2,100}$|^[A-Za-z0-9_.-]{2,100}$/;

/**
 * If `value` matches `urlPrefix`, strip the URL prefix + any trailing path /
 * query / fragment and return just the leading handle. Otherwise return the
 * value untouched. Skipping the path-strip for non-URL input is important —
 * naively stripping `/<rest>` from bare text like "n/a" would yield "n" which
 * could spuriously pass the handle regex.
 */
function extractHandleFromUrlOrPassthrough(value: string, urlPrefix: RegExp): string {
  if (!urlPrefix.test(value)) return value;
  return value
    .replace(urlPrefix, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

/**
 * Returns true if `value` is structurally plausible for `field`. Returns false
 * for empty/whitespace, free-text placeholders, and values whose structure
 * doesn't match the field's expected shape.
 *
 * Fields outside the switch (descriptions, moreDetails, industryTags, etc.)
 * have no structural shape — return true and let the AI/corroboration handle
 * content validity.
 */
export function isLikelyValueForField(field: FieldMetaKey, raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;

  switch (field) {
    case 'website':
    case 'blog':
      return URL_WITH_SCHEME.test(v);

    case 'contactMethod': {
      // Email, URL-with-scheme, mailto:, or a recognizable @handle. Anything
      // else (free text like "email", "Twitter", "TBD", "Coming soon!") is
      // structurally not a contact method.
      if (EMAIL_SHAPE.test(v)) return true;
      if (URL_WITH_SCHEME.test(v)) return true;
      if (MAILTO_SHAPE.test(v)) return true;
      if (AT_HANDLE.test(v)) return true;
      return false;
    }

    case 'twitterHandler': {
      const handle = extractHandleFromUrlOrPassthrough(
        v.replace(/^@/, ''),
        /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\//i
      );
      return TWITTER_HANDLE_BARE.test(handle);
    }

    case 'linkedinHandler': {
      // LinkedIn URL prefix strip is conditional on the value actually being
      // a URL — otherwise "n/a/b" would lose the path and validate against
      // just "n", a false pass. We also tolerate a trailing slash on the slug.
      const isUrl = /^https?:\/\/(?:www\.)?linkedin\.com\//i.test(v);
      const slug = isUrl
        ? v.replace(/^https?:\/\/(?:www\.)?linkedin\.com\//i, '').replace(/\/+$/, '')
        : v.replace(/\/+$/, '');
      return LINKEDIN_SLUG.test(slug);
    }

    case 'telegramHandler': {
      const handle = extractHandleFromUrlOrPassthrough(
        v.replace(/^@/, ''),
        /^https?:\/\/(?:www\.)?(?:t\.me|telegram\.me)\//i
      );
      return TELEGRAM_HANDLE_BARE.test(handle);
    }

    default:
      // Descriptions, moreDetails, industry/investment arrays — no structural
      // gate. Empty already filtered by the trim() above.
      return true;
  }
}

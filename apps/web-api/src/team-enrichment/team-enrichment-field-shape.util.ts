/**
 * Per-field structural validators. Rejects values that can't possibly be the
 * right kind of thing for the field (URL fields without scheme, free text on
 * contactMethod, etc.) without maintaining an explicit placeholder blocklist —
 * placeholders like "Coming soon!", "n/a", "TBD" simply fail the structural
 * check.
 *
 * NOT a content-validity check. A value that PASSES is just "structurally
 * plausible" — the AI judge and corroboration rules still verify entity match.
 */

import { FieldMetaKey } from './team-enrichment.types';
import { extractHandleFromUrlOrPassthrough } from './shared';

const URL_WITH_SCHEME = /^https?:\/\/[^\s/$.?#][^\s]*\.[^\s/$.?#][^\s]*$/i;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;
const MAILTO_SHAPE = /^mailto:[^\s@]+@[^\s@.]+\.[^\s@]+/i;
const AT_HANDLE = /^@[A-Za-z0-9_]{2,}$/;
const TWITTER_HANDLE_BARE = /^[A-Za-z0-9_]{1,15}$/;

// Telegram: 5-32 per their docs, but profiles ≥3 chars exist (e.g. `EFF`).
const TELEGRAM_HANDLE_BARE = /^[A-Za-z0-9_]{3,32}$/;

// LinkedIn: `company/<slug>`, `school/<slug>`, `in/<slug>`, or bare `<slug>`.
const LINKEDIN_SLUG = /^(?:company|school|in)\/[A-Za-z0-9_.-]{2,100}$|^[A-Za-z0-9_.-]{2,100}$/;

export function isLikelyValueForField(field: FieldMetaKey, raw: string): boolean {
  const v = raw.trim();
  if (!v) return false;

  switch (field) {
    case 'website':
    case 'blog':
      return URL_WITH_SCHEME.test(v);

    case 'contactMethod': {
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
      // just "n", a false pass.
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

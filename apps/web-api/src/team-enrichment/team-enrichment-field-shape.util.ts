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

// Free-text fields where the AI is supposed to return PROSE about the team.
const FREE_TEXT_FIELDS = new Set<FieldMetaKey>(['shortDescription', 'longDescription', 'moreDetails']);

// Narration the model emits when it found nothing instead of returning null —
// e.g. `No specific investment fund named "Angel Fund" was found that exactly
// matches the provided name. The term "angel fund" is widely used generically…`.
// These are failures disguised as content; a real description never talks about
// the search itself. Patterns are deliberately anchored on search-meta phrasing
// ("no X was found", "could not find", "the name is generic") so they don't trip
// on legitimate prose (e.g. "Acme was founded in 2019" — "founded", not "found").
const AI_NON_ANSWER_PATTERNS: RegExp[] = [
  /\b(?:could ?n['’]?t|could not|cannot|can ?not|unable to|was(?:n['’]?t| not) able to|were(?:n['’]?t| not) able to|failed to)\s+(?:find|locate|identify|verify|confirm|determine|establish)\b/i,
  /\bno\b[^.?!]{0,80}?\b(?:was|were|is|are|could be)\b[^.?!]{0,20}?\bfound\b/i,
  /\bno\s+(?:specific|exact|official|public|verifiable|reliable|credible|additional|further|relevant|matching)\b[^.?!]{0,80}?\b(?:information|details|data|company|fund|organization|organisation|entity|website|profile|match|results?)\b/i,
  /\bno\s+(?:information|details|data|results?)\b[^.?!]{0,40}?\b(?:available|found|exist)/i,
  /\b(?:does|did|do)\s+not\s+(?:appear\s+to\s+)?(?:exist|match|correspond)\b/i,
  /\bwidely\s+used\s+(?:generic|generically)\b/i,
  /\b(?:is|are|term|name|phrase)\b[^.?!]{0,40}?\bgeneric(?:ally)?\b[^.?!]{0,40}?\b(?:term|name|phrase|descript|used)/i,
  /\bI\s+(?:was unable|could not|could ?n['’]?t|cannot|can ?not|don['’]?t have|do not have)\b/i,
  /\b(?:unfortunately|regrettably)\b/i,
  /\bbased on (?:my|the available) (?:search|research|sources)\b[^.?!]{0,40}?\b(?:no|could ?n['’]?t|unable)\b/i,
];

/**
 * True when a free-text value reads like the model narrating a failed search
 * rather than describing the team. Used to reject "I couldn't find…" text from
 * description fields. Only meaningful for `FREE_TEXT_FIELDS`.
 */
export function looksLikeAiNonAnswer(raw: string | null | undefined): boolean {
  const v = raw?.trim();
  if (!v) return false;
  return AI_NON_ANSWER_PATTERNS.some((re) => re.test(v));
}

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

    case 'shortDescription':
    case 'longDescription':
    case 'moreDetails':
      // Free text has no structural shape, but reject search-failure narration
      // the AI sometimes emits in place of null ("No specific … was found …").
      return !looksLikeAiNonAnswer(v);

    default:
      // Industry/investment arrays — no structural gate. Empty already filtered
      // by the trim() above.
      return true;
  }
}

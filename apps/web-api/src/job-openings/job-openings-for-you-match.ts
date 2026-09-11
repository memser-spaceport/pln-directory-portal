/**
 * The whole of the For You job match: does a job's own words overlap what this
 * member does?
 *
 * Compared against a job's STRUCTURED fields only — roleTitle, roleCategory,
 * department, seniority. Deliberately NOT the scraped posting body, where a
 * "nice to have: Rust" line would read as a match on equal footing with the
 * title.
 *
 * The consequence, accepted when this was specced: individual skills ("Rust",
 * "Solidity") rarely appear in a role title, so most of what this signal
 * actually catches is the member's current role and past experience titles.
 */

/**
 * Words that carry no discriminating signal on their own: grammar, seniority
 * markers, and employment terms. Without them "Senior Engineer" would match
 * "Senior Designer" on `senior` alone, and seniority is a field of its own
 * anyway — matching it is not evidence about what someone does.
 */
const NON_DISCRIMINATING_TOKENS = new Set([
  'a',
  'an',
  'and',
  'at',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with',
  'ii',
  'iii',
  'iv',
  'chief',
  'entry',
  'head',
  'junior',
  'jr',
  'lead',
  'level',
  'mid',
  'principal',
  'senior',
  'sr',
  'staff',
  'contract',
  'freelance',
  'full',
  'hybrid',
  'intern',
  'internship',
  'onsite',
  'part',
  'remote',
  'time',
  'new',
  'role',
  'roles',
  'team',
]);

/** Keeps two-letter tokens that mean something on their own — AI, UX, QA, ML. */
const MIN_TOKEN_LENGTH = 2;

/**
 * Shortest token allowed to match by prefix rather than exactly, so
 * "engineer"/"engineering" and "design"/"designer" agree — the role titles
 * members write and the `roleCategory` values the board carries are the same
 * words in different forms. Above the two-letter tokens, so "ai" cannot
 * swallow "airflow".
 */
const MIN_PREFIX_LENGTH = 4;

export function tokenizeJobMatchText(values: Array<string | null | undefined>): Set<string> {
  const tokens = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    // `+` and `#` survive the split so "C++" and "C#" stay one token each.
    for (const token of value.toLowerCase().split(/[^a-z0-9+#]+/)) {
      if (token.length < MIN_TOKEN_LENGTH) continue;
      if (NON_DISCRIMINATING_TOKENS.has(token)) continue;
      tokens.add(token);
    }
  }
  return tokens;
}

export function hasJobTextMatch(memberTokens: ReadonlySet<string>, jobTokens: ReadonlySet<string>): boolean {
  for (const memberToken of memberTokens) {
    for (const jobToken of jobTokens) {
      if (memberToken === jobToken) return true;
      if (Math.min(memberToken.length, jobToken.length) < MIN_PREFIX_LENGTH) continue;
      if (memberToken.startsWith(jobToken) || jobToken.startsWith(memberToken)) return true;
    }
  }
  return false;
}

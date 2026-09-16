import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma.service';

const MIN_TOKEN_LENGTH = 2;
/**
 * Below this length a token is only allowed to match another token exactly (whole word),
 * never as a substring: a two-letter token like "ai" (from "decentralized AI") is a substring
 * of far too many unrelated words — "Cr*ai*g", "Cl*ai*re", "Sustain*ai*bility" — for
 * substring containment to mean anything.
 */
const MIN_SUBSTRING_MATCH_LENGTH = 3;

export function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_TOKEN_LENGTH);
}

function contains(haystack: string, needle: string): boolean {
  return needle.length >= MIN_SUBSTRING_MATCH_LENGTH && haystack.includes(needle);
}

function tokensMatch(a: string, b: string): boolean {
  if (a.length < MIN_SUBSTRING_MATCH_LENGTH || b.length < MIN_SUBSTRING_MATCH_LENGTH) {
    return a === b;
  }
  return a.includes(b) || b.includes(a);
}

/**
 * A plain `value.includes(search)` only matches when the STORED value contains a model's
 * search term verbatim. Stored tags/titles are often terser than the term a model generates
 * from a user's question (tag "neuro tech" vs. model-generated "neurotechnology"), so real
 * matches get silently dropped. Falls back to per-token overlap (in either substring
 * direction) so "neurotechnology" still matches a "neuro"/"tech"/"neuro tech" tag, and a
 * compound tag like "DeepTech" still matches a search of "deep tech".
 *
 * Tokens shorter than `MIN_SUBSTRING_MATCH_LENGTH` only match whole tokens, so "AI" still
 * matches an "AI/ML" tag but not a name that happens to contain those two letters.
 */
export function fuzzyMatches(value: string, search: string): boolean {
  const normalizedValue = value.toLowerCase();
  const normalizedSearch = search.toLowerCase();
  if (contains(normalizedValue, normalizedSearch) || contains(normalizedSearch, normalizedValue)) {
    return true;
  }
  const valueTokens = tokenize(value);
  const searchTokens = tokenize(search);
  return searchTokens.some((searchToken) => valueTokens.some((valueToken) => tokensMatch(searchToken, valueToken)));
}

/**
 * Whether free text (a description, a bio) mentions a topic. Stricter than `fuzzyMatches`,
 * which treats any single overlapping token as a hit — fine for a short tag, far too loose for
 * a paragraph. The whole phrase must appear, or every topic word must appear as a word (or
 * word prefix, so "storage" also covers "storages") in the text.
 */
export function textMentions(text: string, topic: string): boolean {
  if (contains(text.toLowerCase(), topic.toLowerCase())) {
    return true;
  }
  const textTokens = tokenize(text);
  const topicTokens = tokenize(topic);
  if (topicTokens.length === 0) return false;
  return topicTokens.every((topicToken) =>
    textTokens.some((textToken) =>
      topicToken.length < MIN_SUBSTRING_MATCH_LENGTH ? textToken === topicToken : textToken.startsWith(topicToken)
    )
  );
}

/**
 * Terms to check a stored value against for a fuzzy match: the raw search string itself, plus
 * whatever it tokenizes into. A single compound word like "neurotechnology" tokenizes to just
 * itself — nothing to split on — but matching still works because the whole term already
 * contains the terser stored tag ("neuro") as a substring. A multi-word search like "deep tech"
 * additionally yields "deep" and "tech", so a compound stored tag ("DeepTech", with no gap for
 * the two-word phrase to land in) can still match via one of its words.
 */
export function searchTerms(search: string): string[] {
  return Array.from(new Set([search.toLowerCase(), ...tokenize(search)]));
}

/**
 * SQL equivalent of `tokensMatch`/`contains` for one search term against one column, for
 * matching in the database rather than over a capped in-memory candidate window. Bidirectional
 * (term-in-column AND column-in-term), with the same short-token rule: a term shorter than
 * `MIN_SUBSTRING_MATCH_LENGTH` must match a whole word (`\m`/`\M` boundaries), and a stored
 * value that short must equal the term outright.
 *
 * `NULLIF(column, '')` matters for the reverse-direction check (`term LIKE '%' || column || '%'`),
 * which would otherwise collapse to `term LIKE '%%'` — true for every row — for a NULL column
 * (e.g. `COALESCE(t.name, m.name)` on an orphaned profile) or a genuinely empty string. NULLIF
 * collapses either to NULL, which propagates through LOWER/`||`/LIKE to NULL, i.e. false.
 */
export function fuzzySqlTermCondition(column: Prisma.Sql, term: string): Prisma.Sql {
  const normalizedColumn = Prisma.sql`LOWER(NULLIF(${column}, ''))`;
  const normalizedTerm = term.toLowerCase();
  return Prisma.sql`(${Prisma.join(
    [
      fuzzySqlContainsCondition(column, term),
      Prisma.sql`(LENGTH(${normalizedColumn}) >= ${MIN_SUBSTRING_MATCH_LENGTH} AND ${normalizedTerm} LIKE '%' || ${normalizedColumn} || '%')`,
      Prisma.sql`${normalizedColumn} = ${normalizedTerm}`,
    ],
    ' OR '
  )})`;
}

/**
 * One direction only: the term appears inside the stored value (SQL equivalent of `contains`
 * plus the whole-word rule for short terms). A term too short to substring-match and unsafe to
 * splice into a regex (e.g. "c+") can only match by equality.
 */
export function fuzzySqlContainsCondition(column: Prisma.Sql, term: string): Prisma.Sql {
  const normalizedColumn = Prisma.sql`LOWER(NULLIF(${column}, ''))`;
  const normalizedTerm = term.toLowerCase();
  if (normalizedTerm.length >= MIN_SUBSTRING_MATCH_LENGTH) {
    return Prisma.sql`${normalizedColumn} LIKE '%' || ${normalizedTerm} || '%'`;
  }
  if (/^[a-z0-9]+$/.test(normalizedTerm)) {
    return Prisma.sql`${normalizedColumn} ~ ${`\\m${normalizedTerm}\\M`}`;
  }
  return Prisma.sql`${normalizedColumn} = ${normalizedTerm}`;
}

/**
 * SQL equivalent of `fuzzyMatches(column, search)`: the column matches the raw search string or
 * any of its tokens (see `searchTerms`), each via `fuzzySqlTermCondition`.
 */
export function fuzzySqlCondition(column: Prisma.Sql, search: string): Prisma.Sql {
  return Prisma.sql`(${Prisma.join(
    searchTerms(search).map((term) => fuzzySqlTermCondition(column, term)),
    ' OR '
  )})`;
}

/**
 * A single-substring `contains` match against a title/name won't match a multi-word phrase
 * like "senior rust engineer roles" against a title like "Senior Backend Engineer, Rust" — the
 * words are there, just not contiguous in that order. Tool descriptions ask the model for one
 * keyword, but models don't always comply; call this to retry with the single longest word in
 * the phrase (a reasonable proxy for "the distinctive term") when the literal phrase matched
 * nothing.
 */
export function longestWord(phrase: string): string | undefined {
  const words = phrase.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return undefined;
  return words.reduce((longest, word) => (word.length > longest.length ? word : longest));
}

/**
 * `focus` filters (job-openings, news) are matched with an exact `in: [...]` against
 * `FocusArea.title` (e.g. "Neurotech", "DeSci") — there's no enum telling the model the
 * canonical titles, so a free-text guess ("neuro tech", "AI") that isn't an exact,
 * identically-cased hit silently filters everything out. Resolves the model's free text to
 * whichever real focus-area titles fuzzy-match it, so the exact-match filter downstream still
 * gets a title it actually recognizes. Falls back to the raw text when nothing resembles it,
 * preserving today's behavior for an already-exact guess.
 */
export async function resolveFocusAreaTitles(prisma: PrismaService, freeText: string): Promise<string[]> {
  const focusAreas = await prisma.focusArea.findMany({ select: { title: true } });
  const matches = focusAreas.map((fa) => fa.title).filter((title) => fuzzyMatches(title, freeText));
  return matches.length > 0 ? matches : [freeText];
}

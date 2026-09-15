import { PrismaService } from '../../shared/prisma.service';

const MIN_FUZZY_TOKEN_LENGTH = 2;

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= MIN_FUZZY_TOKEN_LENGTH);
}

/**
 * A plain `value.includes(search)` only matches when the STORED value contains a model's
 * search term verbatim. Stored tags/titles are often terser than the term a model generates
 * from a user's question (tag "neuro tech" vs. model-generated "neurotechnology"), so real
 * matches get silently dropped. Falls back to per-token overlap (in either substring
 * direction) so "neurotechnology" still matches a "neuro"/"tech"/"neuro tech" tag, and a
 * compound tag like "DeepTech" still matches a search of "deep tech".
 */
export function fuzzyMatches(value: string, search: string): boolean {
  const normalizedValue = value.toLowerCase();
  const normalizedSearch = search.toLowerCase();
  if (normalizedValue.includes(normalizedSearch) || normalizedSearch.includes(normalizedValue)) {
    return true;
  }
  const valueTokens = tokenize(value);
  const searchTokens = tokenize(search);
  return searchTokens.some((searchToken) =>
    valueTokens.some((valueToken) => valueToken.includes(searchToken) || searchToken.includes(valueToken))
  );
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

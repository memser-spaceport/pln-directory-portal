/**
 * Overlaps shorter than this are left alone: a shared "the" or single space at the
 * seam is far more likely to be legitimate text than a repetition.
 */
const MIN_OVERLAP_CHARS = 6;

/**
 * Longest stretch of `partial` worth comparing against a continuation. A model that
 * restarts an answer repeats its last line or block, not thousands of characters.
 */
export const MAX_OVERLAP_CHARS = 2000;

/**
 * Removes from `continuation` whatever it repeats of the end of `partial`, so the two
 * can be concatenated without duplicating a table header, list item or sentence the
 * model restated before carrying on. Leading whitespace in front of a repeated
 * stretch is dropped with it; a continuation with no repetition is returned as is.
 */
export function trimRepeatedPrefix(partial: string, continuation: string): string {
  const tail = partial.slice(-MAX_OVERLAP_CHARS);
  const trimmed = continuation.trimStart();
  const maxOverlap = Math.min(tail.length, trimmed.length);
  for (let length = maxOverlap; length >= MIN_OVERLAP_CHARS; length--) {
    if (tail.endsWith(trimmed.slice(0, length))) {
      return trimmed.slice(length);
    }
  }
  return continuation;
}

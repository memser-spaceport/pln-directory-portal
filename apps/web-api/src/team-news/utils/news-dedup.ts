import { normalizeSourceUrl } from './url-normalize';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'in', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'with',
]);

export function normalizeNewsText(value: string): string {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9$]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(value: string): Set<string> {
  return new Set(
    normalizeNewsText(value)
      .split(' ')
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token))
  );
}

export function isDuplicateNewsStory(
  left: { sourceUrl: string; title: string; summary?: string | null },
  right: { sourceUrl: string; title: string; summary?: string | null }
): boolean {
  if (normalizeSourceUrl(left.sourceUrl) === normalizeSourceUrl(right.sourceUrl)) {
    return true;
  }

  const leftTokens = tokens(`${left.title} ${left.summary ?? ''}`);
  const rightTokens = tokens(`${right.title} ${right.summary ?? ''}`);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  let overlap = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) overlap++;
  }

  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = union ? overlap / union : 0;
  const containment = overlap / Math.min(leftTokens.size, rightTokens.size);

  return jaccard >= 0.6 && containment >= 0.75;
}

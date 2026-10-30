import { BadRequestException } from '@nestjs/common';
import type { NewsTagVocabulary } from '../news-tag-vocabulary.service';

/**
 * News tags a member chose on the News preferences page (LAB-2969, LAB-2998):
 * focus-area slugs, stored as `Member.preferences.newsTags`. They replace the
 * categories as what For You and the digest match news on.
 */

/**
 * Validate an incoming `newsTags` value against the focus-area vocabulary and
 * return it de-duplicated, in the order given. An empty list is a valid choice
 * (the member removed every tag).
 *
 * @throws BadRequestException for a non-list, a non-string entry or a slug that is not a focus area.
 */
export function parseNewsTags(value: unknown, vocabulary: NewsTagVocabulary): string[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('newsTags must be a list of focus-area slugs');
  }
  const unknown = value.filter((v) => typeof v !== 'string' || !vocabulary.has(v));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown news tags: ${unknown.map(String).join(', ')}`);
  }
  return [...new Set(value as string[])];
}

/**
 * The member's saved news tags, or `undefined` when they never saved any. An
 * empty list is a saved choice, not "never saved", so it comes back as `[]`.
 */
export function readStoredNewsTags(preferences: unknown): string[] | undefined {
  if (!preferences || typeof preferences !== 'object') return undefined;
  const stored = (preferences as Record<string, unknown>).newsTags;
  if (!Array.isArray(stored)) return undefined;
  return stored.filter((v): v is string => typeof v === 'string');
}

/**
 * What the preferences GET returns for news tags: the saved list, or, for a
 * member who never saved one, the starting tags from `seed` marked as seeded.
 * Reading never stores anything.
 */
export async function resolveNewsTags(
  preferences: unknown,
  seed: () => Promise<string[]>
): Promise<{ newsTags: string[]; newsTagsSeeded?: true }> {
  const stored = readStoredNewsTags(preferences);
  if (stored) return { newsTags: stored };
  return { newsTags: await seed(), newsTagsSeeded: true };
}

/**
 * Whether the digest picks news by the member's tags (LAB-2999). Read on every
 * call, so flipping the env var needs no code change; anything but "true" is off.
 */
export function isNewsTagPicksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NEWS_TAG_PICKS_ENABLED ?? '').trim().toLowerCase() === 'true';
}

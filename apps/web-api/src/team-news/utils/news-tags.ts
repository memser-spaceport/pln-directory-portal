import { BadRequestException } from '@nestjs/common';
import type { NewsTagVocabulary } from '../news-tag-vocabulary.service';

/**
 * News tags a member chose on the News preferences page (LAB-2969, LAB-2998):
 * focus-area slugs, stored as `Member.preferences.newsTags`. They replace the
 * categories as what For You and the digest match news on.
 */

/**
 * Validate an incoming `newsTags` value against the focus-area vocabulary and
 * return it de-duplicated, in the order given. An empty list is valid and is
 * stored (the member removed every tag).
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
 * The member's stored news tags, or `undefined` when they never saved any. A
 * saved empty list comes back as `[]`. To read the member's choice, use
 * readChosenNewsTags: there an empty list counts as no saved tags.
 */
export function readStoredNewsTags(preferences: unknown): string[] | undefined {
  if (!preferences || typeof preferences !== 'object') return undefined;
  const stored = (preferences as Record<string, unknown>).newsTags;
  if (!Array.isArray(stored)) return undefined;
  return stored.filter((v): v is string => typeof v === 'string');
}

/**
 * The tags the member chose: the stored list when it has 1 or more tags, else
 * `undefined`. A member who never saved a list and a member who saved an empty
 * one both have no saved tags, and get starting tags (LAB-3243).
 */
export function readChosenNewsTags(preferences: unknown): string[] | undefined {
  const stored = readStoredNewsTags(preferences);
  return stored && stored.length > 0 ? stored : undefined;
}

/**
 * What the preferences GET returns for news tags: the saved list, or, for a
 * member with no saved tags (never saved, or saved an empty list), the
 * starting tags from `seed` marked as seeded. Reading never stores anything.
 */
export async function resolveNewsTags(
  preferences: unknown,
  seed: () => Promise<string[]>
): Promise<{ newsTags: string[]; newsTagsSeeded?: true }> {
  const chosen = readChosenNewsTags(preferences);
  if (chosen) return { newsTags: chosen };
  return { newsTags: await seed(), newsTagsSeeded: true };
}

/**
 * Whether the digest picks news by the member's tags (LAB-2999). Read on every
 * call, so flipping the env var needs no code change; anything but "true" is off.
 */
export function isNewsTagPicksEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NEWS_TAG_PICKS_ENABLED ?? '').trim().toLowerCase() === 'true';
}

/**
 * Whether starting tags come from the member interest profile first (LAB-3199).
 * Read on every call; anything but "true" is off. Stays off in an environment
 * until the LAB-3124 pilot passes.
 */
export function isNewsProfileStartingTagsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return (env.NEWS_PROFILE_STARTING_TAGS_ENABLED ?? '').trim().toLowerCase() === 'true';
}

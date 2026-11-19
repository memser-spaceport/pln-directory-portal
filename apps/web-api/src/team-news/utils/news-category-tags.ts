import { BadRequestException } from '@nestjs/common';
import { NewsEventType } from '@prisma/client';
import { readChosenNewsTags } from './news-tags';

/**
 * Categories a member can pick as tags on News preferences (LAB-3140).
 * Separate from `newsCategories`: that key rejects an empty list and defaults
 * to every category, so an old saved value must not turn these tags on.
 */
export const NEWS_CATEGORY_TAGS: NewsEventType[] = [
  NewsEventType.FUNDING,
  NewsEventType.LAUNCH,
  NewsEventType.ANNOUNCEMENT,
];

/**
 * Validate an incoming `newsCategoryTags` value. An empty list is a valid
 * choice and means no category match. Unknown values are rejected.
 *
 * @throws BadRequestException for a non-list or a value outside the three categories.
 */
export function parseNewsCategoryTags(value: unknown): NewsEventType[] {
  if (!Array.isArray(value)) {
    throw new BadRequestException('newsCategoryTags must be a list of news categories');
  }
  const unknown = value.filter((v) => typeof v !== 'string' || !NEWS_CATEGORY_TAGS.includes(v as NewsEventType));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown news category tags: ${unknown.map(String).join(', ')}`);
  }
  return NEWS_CATEGORY_TAGS.filter((category) => value.includes(category));
}

/**
 * Stored category tags, or `[]` when the member never saved any. Invalid entries are dropped.
 * To read what the member's news is matched on, use resolveNewsCategoryTags.
 */
export function readNewsCategoryTags(preferences: unknown): NewsEventType[] {
  const stored = (preferences as { newsCategoryTags?: unknown } | null | undefined)?.newsCategoryTags;
  if (!Array.isArray(stored)) return [];
  return NEWS_CATEGORY_TAGS.filter((category) => stored.includes(category));
}

/**
 * The member's effective category tags (LAB-3284): the stored ones when there
 * is 1 or more. With none stored, a member with saved news tags has no category
 * tags, and a member with no saved news tags (never saved, or saved an empty
 * list) gets every category tag as the default. Reads only.
 */
export function resolveNewsCategoryTags(preferences: unknown): NewsEventType[] {
  const stored = readNewsCategoryTags(preferences);
  if (stored.length > 0) return stored;
  return readChosenNewsTags(preferences) ? [] : [...NEWS_CATEGORY_TAGS];
}

/**
 * What a preferences save adds for a member's first saved news tags (LAB-3284):
 * the default category tags, when the patch carries 1 or more news tags and no
 * category tags of its own. The caller applies it only to a member with no
 * saved news tags and no saved category tags, so the categories News
 * preferences showed as selected stay after the first topic save.
 */
export function defaultCategoryTagsForTagSave(
  patch: Record<string, unknown>
): { newsCategoryTags: NewsEventType[] } | null {
  if ('newsCategoryTags' in patch) return null;
  const tags = patch.newsTags;
  if (!Array.isArray(tags) || tags.length === 0) return null;
  return { newsCategoryTags: [...NEWS_CATEGORY_TAGS] };
}

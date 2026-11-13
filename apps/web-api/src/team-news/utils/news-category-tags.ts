import { BadRequestException } from '@nestjs/common';
import { NewsEventType } from '@prisma/client';

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

/** Stored category tags, or `[]` when the member never saved any. Invalid entries are dropped. */
export function readNewsCategoryTags(preferences: unknown): NewsEventType[] {
  const stored = (preferences as { newsCategoryTags?: unknown } | null | undefined)?.newsCategoryTags;
  if (!Array.isArray(stored)) return [];
  return NEWS_CATEGORY_TAGS.filter((category) => stored.includes(category));
}

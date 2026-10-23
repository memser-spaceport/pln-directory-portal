import { BadRequestException } from '@nestjs/common';
import { NewsEventType } from '@prisma/client';

/**
 * News categories a member can choose on the News preferences page
 * (LAB-2939/2940): every news event type, in the enum's order. They narrow
 * the For You feed (client-side) and the digest's personal picks; the digest's
 * top story stays global. Stored as `Member.preferences.newsCategories`.
 */
export const NEWS_CATEGORIES: NewsEventType[] = Object.values(NewsEventType);

/**
 * Validate an incoming `newsCategories` value and return it de-duplicated, in
 * enum order. At least one category must stay on: an empty list would leave
 * For You and the digest with no news at all, which the page never offers.
 *
 * @throws BadRequestException for a non-list, an empty list or an unknown value.
 */
export function parseNewsCategories(value: unknown): NewsEventType[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new BadRequestException('newsCategories must be a non-empty list of news categories');
  }
  const unknown = value.filter((v) => typeof v !== 'string' || !NEWS_CATEGORIES.includes(v as NewsEventType));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown news categories: ${unknown.map(String).join(', ')}`);
  }
  return NEWS_CATEGORIES.filter((category) => value.includes(category));
}

/**
 * A member's categories from their stored preferences. Nothing stored, or
 * nothing valid left in what is stored, means every category, which is the
 * default and today's behaviour.
 */
export function readNewsCategories(preferences: unknown): NewsEventType[] {
  const stored = (preferences as { newsCategories?: unknown } | null | undefined)?.newsCategories;
  if (!Array.isArray(stored)) return [...NEWS_CATEGORIES];
  const valid = NEWS_CATEGORIES.filter((category) => stored.includes(category));
  return valid.length > 0 ? valid : [...NEWS_CATEGORIES];
}

/** True when the list narrows anything, i.e. not every category is on. */
export function narrowsNews(categories: NewsEventType[]): boolean {
  return NEWS_CATEGORIES.some((category) => !categories.includes(category));
}

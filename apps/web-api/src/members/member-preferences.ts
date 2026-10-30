import { BadRequestException } from '@nestjs/common';
import { parseNewsCategories } from '../team-news/utils/news-categories';
import { parseNewsTags } from '../team-news/utils/news-tags';
import type { NewsTagVocabulary } from '../team-news/news-tag-vocabulary.service';

/**
 * Keys the GET response *injects* rather than stores.
 *
 * `buildPreferenceResponse` computes these from member columns — whether the
 * member has an email, a GitHub handle, a newsletter subscription — and merges
 * them into the object it returns. They look exactly like settings, and
 * `EditContactForm` echoes several of them straight back on save.
 *
 * Persisting them would freeze a snapshot of the live columns into the blob,
 * where it would shadow the real values from then on. So they are dropped on
 * the way in.
 */
export const DERIVED_PREFERENCE_KEYS = [
  'isNull',
  'email',
  'github',
  'telegram',
  'discord',
  'linkedin',
  'twitter',
  'bluesky',
  'subscription',
  // Computed on read for a member who never saved news tags (LAB-2998); a client
  // echoing it back must not freeze "seeded" into the blob.
  'newsTagsSeeded',
] as const;

/**
 * Validate an incoming preferences body and reduce it to what may be stored.
 *
 * Deliberately permissive about *which* settings keys it accepts: the stored
 * shape has grown past `PreferenceSchema` (which knows the nine contact keys
 * but none of `showForumBanner`, `showOfficeHoursDialog`,
 * `showDemoDayConnectDialog`, `showDemoDayInvestDialog`), and rejecting unknown
 * keys here would break live clients rather than protect anyone. What it does
 * enforce is that the body is a plain object, so a string or an array cannot
 * reach a `jsonb` merge.
 *
 * @param newsTagVocabulary - The focus-area vocabulary, needed only when the body
 *   carries `newsTags`.
 * @throws BadRequestException when the body is not a plain object, or when it
 *   carries an invalid `newsCategories` (see parseNewsCategories) or `newsTags`
 *   (see parseNewsTags).
 */
export function toPreferencePatch(body: unknown, newsTagVocabulary?: NewsTagVocabulary): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException('preferences must be an object');
  }

  const patch: Record<string, unknown> = { ...(body as Record<string, unknown>) };
  for (const key of DERIVED_PREFERENCE_KEYS) {
    delete patch[key];
  }
  /* The one validated key (LAB-2940): the digest and For You read it, so a
     typo or an empty list must not reach the blob. */
  if ('newsCategories' in patch) {
    patch.newsCategories = parseNewsCategories(patch.newsCategories);
  }
  // LAB-2998: For You and the digest match news on these, so only focus-area slugs reach the blob.
  if ('newsTags' in patch) {
    if (!newsTagVocabulary) {
      throw new Error('toPreferencePatch needs the news tag vocabulary to validate newsTags');
    }
    patch.newsTags = parseNewsTags(patch.newsTags, newsTagVocabulary);
  }
  return patch;
}

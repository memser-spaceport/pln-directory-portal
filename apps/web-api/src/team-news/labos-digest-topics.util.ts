import type { LabosDigestPage, TeamNewsTagsResponse } from 'libs/contracts/src/schema/team-news';
import { expandNewsTags, NewsTagVocabulary } from './news-tag-vocabulary.service';

type Topic = LabosDigestPage['topics']['followed'][number];

/**
 * The digest page's topics (LAB-3289).
 *
 * `followed`: the member's tags (saved, else starting), in their order, with vocabulary titles; unknown slugs drop.
 * `suggested`: the choosable tags (the News preferences list, parents and children) the member doesn't already get,
 * by interest-profile TOPIC score, highest first, then by title. A tag with no score counts as 0, so tags the member
 * marked "Less like this" (negative) come after them. A followed parent covers its children, so those aren't
 * suggested either.
 */
export function digestTopics(
  followedSlugs: string[],
  choosable: TeamNewsTagsResponse,
  vocabulary: NewsTagVocabulary,
  scores: ReadonlyMap<string, number>
): LabosDigestPage['topics'] {
  const followed: Topic[] = [];
  for (const slug of new Set(followedSlugs)) {
    const tag = vocabulary.get(slug);
    if (tag) followed.push({ slug: tag.slug, title: tag.title });
  }
  const covered = expandNewsTags(
    followed.map((t) => t.slug),
    vocabulary
  );

  const seen = new Set<string>();
  const candidates: Topic[] = [];
  for (const group of choosable) {
    for (const tag of [group, ...group.children]) {
      if (covered.has(tag.slug) || seen.has(tag.slug)) continue;
      seen.add(tag.slug);
      candidates.push({ slug: tag.slug, title: tag.title });
    }
  }
  const score = (slug: string) => scores.get(slug) ?? 0;
  const suggested = candidates.sort((a, b) => score(b.slug) - score(a.slug) || a.title.localeCompare(b.title));
  return { followed, suggested };
}

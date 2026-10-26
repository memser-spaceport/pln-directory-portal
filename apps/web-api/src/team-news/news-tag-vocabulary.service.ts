import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { slugify } from '../utils/helper/helper';

/**
 * News tags are focus-area slugs (LAB-2969): the enrichment producer tags news
 * with `slugify(FocusArea.title)` (`ai`, `digital-human-rights`, ...), next to
 * legacy verbs (`launch`, `fund`, `$`) and free-form extras. Only focus-area
 * slugs are tags a member can choose, so the focus-area table is the vocabulary.
 */
export type NewsTag = {
  slug: string;
  title: string;
  /** The parent focus area's slug, or null for a top-level focus area. */
  parentSlug: string | null;
};

export type NewsTagVocabulary = ReadonlyMap<string, NewsTag>;

type FocusAreaRow = { uid: string; title: string; parentUid: string | null };

const CACHE_MS = 10 * 60 * 1000;

/**
 * Slug → tag for every focus area. Titles are unique, but two could still
 * slugify the same (`AI & Robotics` and `AI Robotics`): the first wins and the
 * collision is reported, so a duplicate never silently changes which area a
 * slug means.
 */
export function buildNewsTagVocabulary(
  areas: FocusAreaRow[],
  onCollision: (slug: string, kept: string, dropped: string) => void = () => undefined
): NewsTagVocabulary {
  const slugByUid = new Map(areas.map((a) => [a.uid, slugify(a.title)]));
  const vocabulary = new Map<string, NewsTag>();
  for (const area of areas) {
    const slug = slugByUid.get(area.uid) as string;
    if (!slug) continue;
    const existing = vocabulary.get(slug);
    if (existing) {
      onCollision(slug, existing.title, area.title);
      continue;
    }
    vocabulary.set(slug, {
      slug,
      title: area.title,
      parentSlug: area.parentUid ? slugByUid.get(area.parentUid) ?? null : null,
    });
  }
  return vocabulary;
}

export type NewsTagGroup = { slug: string; title: string; children: { slug: string; title: string }[] };

/**
 * The tags news actually used, as the list members choose from: each used
 * focus area under its top-level parent, with the parent listed even when only
 * a child was used. Tags that are not focus-area slugs (`launch`, `$`, free-form
 * extras) are dropped. Groups and children are sorted by title.
 */
export function groupUsedNewsTags(usedTags: Iterable<string>, vocabulary: NewsTagVocabulary): NewsTagGroup[] {
  const groups = new Map<string, { tag: NewsTag; children: Map<string, NewsTag> }>();
  const rootOf = (tag: NewsTag): NewsTag => {
    let current = tag;
    const seen = new Set<string>();
    while (current.parentSlug && vocabulary.has(current.parentSlug) && !seen.has(current.slug)) {
      seen.add(current.slug);
      current = vocabulary.get(current.parentSlug) as NewsTag;
    }
    return current;
  };
  for (const used of usedTags) {
    const tag = vocabulary.get(used);
    if (!tag) continue;
    const root = rootOf(tag);
    const group = groups.get(root.slug) ?? { tag: root, children: new Map<string, NewsTag>() };
    groups.set(root.slug, group);
    if (root.slug !== tag.slug) group.children.set(tag.slug, tag);
  }
  const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);
  return [...groups.values()]
    .map(({ tag, children }) => ({
      slug: tag.slug,
      title: tag.title,
      children: [...children.values()].map(({ slug, title }) => ({ slug, title })).sort(byTitle),
    }))
    .sort(byTitle);
}

/**
 * The focus-area vocabulary, cached in memory, plus the starting tags of a
 * member who never chose any. Depends only on Prisma, so both the members and
 * the team-news modules can provide it without importing each other.
 */
@Injectable()
export class NewsTagVocabularyService {
  private readonly logger = new Logger(NewsTagVocabularyService.name);
  private cached: { at: number; vocabulary: Promise<NewsTagVocabulary> } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  getVocabulary(): Promise<NewsTagVocabulary> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.vocabulary;
    }
    const vocabulary = this.prisma.focusArea
      .findMany({ select: { uid: true, title: true, parentUid: true }, orderBy: { id: 'asc' } })
      .then((areas) =>
        buildNewsTagVocabulary(areas, (slug, kept, dropped) =>
          this.logger.warn(`Focus areas "${kept}" and "${dropped}" share the news tag slug "${slug}"; kept "${kept}"`)
        )
      );
    this.cached = { at: Date.now(), vocabulary };
    // A failed load must not stay cached for ten minutes.
    vocabulary.catch(() => {
      if (this.cached?.vocabulary === vocabulary) this.cached = null;
    });
    return vocabulary;
  }

  /**
   * Starting tags for a member who never saved news tags: the focus areas of
   * the teams they belong to (each team focus area itself, child or top level),
   * as vocabulary slugs. Reads only; nothing is stored.
   */
  async seedTagsForMember(memberUid: string): Promise<string[]> {
    const [vocabulary, rows] = await Promise.all([
      this.getVocabulary(),
      this.prisma.teamFocusArea.findMany({
        where: { team: { teamMemberRoles: { some: { memberUid } } } },
        select: { focusArea: { select: { title: true } } },
      }),
    ]);
    const slugs: string[] = [];
    for (const row of rows) {
      const slug = slugify(row.focusArea.title);
      if (vocabulary.has(slug) && !slugs.includes(slug)) slugs.push(slug);
    }
    return slugs;
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LabosDigestChoiceKind, NewsEventType, Prisma } from '@prisma/client';
import type {
  LabosDigestChoiceResponse,
  LabosDigestChoiceValue,
  LabosDigestPage,
  LabosDigestPageSource,
} from 'libs/contracts/src/schema/team-news';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';
import { NewsTagVocabularyService } from './news-tag-vocabulary.service';
import { LabosDigestForumReader } from './labos-digest-forum.reader';
import { DigestLinkPayload, verifyDigestLinkToken } from './labos-digest-link-token.util';
import {
  applyChoiceToWeights,
  jsonToWeights,
  storyFocusTags,
  TopicWeights,
  undoChoiceWeights,
  weightsDiffer,
} from './labos-digest-choice.util';
import {
  DIGEST_CHOICE_WEIGHT_STEP,
  MIN_STORED_SCORE,
} from '../member-interest-profile/member-interest-profile.constants';
import { TEAM_NEWS_IMAGE_SELECT, toNewsImageDto } from './utils/news-image-variants';
import { extractDomain, normalizeSourceUrl } from './utils/url-normalize';
import { nextDigestSendAt } from './labos-digest-schedule.util';
import { digestTopics } from './labos-digest-topics.util';
import { TeamNewsQueryService } from './team-news-query.service';
import { readChosenNewsTags } from './utils/news-tags';

const toChoiceValue = (kind: LabosDigestChoiceKind): LabosDigestChoiceValue => (kind === 'MORE' ? 'more' : 'less');
const toChoiceKind = (value: LabosDigestChoiceValue): LabosDigestChoiceKind => (value === 'more' ? 'MORE' : 'LESS');

type Tx = Prisma.TransactionClient;

/** The story's main source, then its other sources, each once (compared after URL normalization). */
export function storySources(sourceUrl: string, sourceUrls: string[] | null | undefined): LabosDigestPageSource[] {
  const seen = new Set<string>();
  return [sourceUrl, ...(sourceUrls ?? [])].flatMap((raw) => {
    const url = raw?.trim();
    if (!url) return [];
    const key = normalizeSourceUrl(url);
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ url, domain: extractDomain(url) }];
  });
}

/**
 * The public digest page (LAB-3263): reads one member's digest from a signed email link, and saves their
 * "More like this" / "Less like this" choices. Reading never changes anything, so email link scanners are safe.
 * A choice moves the member's interest profile topic weights; it never changes their saved news tags.
 */
@Injectable()
export class LabosDigestPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagVocabulary: NewsTagVocabularyService,
    private readonly forum: LabosDigestForumReader,
    private readonly cache: CacheService,
    private readonly newsQuery: TeamNewsQueryService
  ) {}

  /** @throws DigestLinkError for a bad token; NotFoundException when the member no longer exists. */
  async read(token: string): Promise<LabosDigestPage> {
    const link = verifyDigestLinkToken(token);
    const now = new Date();
    const [member, items, choices, forum, follows, comments, activeRoles, vocabulary, choosable, topicScores] =
      await Promise.all([
        this.prisma.member.findUnique({ where: { uid: link.m }, select: { name: true, preferences: true } }),
        this.prisma.teamNewsItem.findMany({
          where: { uid: { in: link.n } },
          select: {
            uid: true,
            title: true,
            summary: true,
            contentHtml: true,
            imageUrl: true,
            sourceUrl: true,
            sourceUrls: true,
            sourceDomain: true,
            eventType: true,
            tags: true,
            team: { select: { uid: true, name: true, logo: { select: { url: true } } } },
            ...TEAM_NEWS_IMAGE_SELECT,
          },
        }),
        this.prisma.labosDigestChoice.findMany({
          where: { memberUid: link.m, newsItemUid: { in: link.n }, undoneAt: null },
          select: { newsItemUid: true, choice: true },
        }),
        this.forum.read(link.p),
        this.prisma.follow.findMany({
          where: { memberUid: link.m, entityType: 'TEAM' },
          select: { entityUid: true },
        }),
        this.prisma.feedComment.groupBy({
          by: ['newsItemUid'],
          where: { newsItemUid: { in: link.n } },
          _count: { _all: true },
        }),
        this.prisma.teamMemberRole.count({
          where: { memberUid: link.m, OR: [{ endDate: null }, { endDate: { gte: now } }] },
        }),
        this.tagVocabulary.getVocabulary(),
        this.newsQuery.listNewsTags(now),
        this.prisma.memberInterestProfileEntry.findMany({
          where: { memberUid: link.m, kind: 'TOPIC' },
          select: { key: true, score: true },
        }),
      ]);
    if (!member) throw new NotFoundException('Digest not found');
    // Same tags News preferences shows as ticked: the saved list, else the starting tags. Reading stores nothing.
    const followedSlugs =
      readChosenNewsTags(member.preferences) ?? (await this.tagVocabulary.seedTagsForMember(link.m));

    const itemByUid = new Map(items.map((item) => [item.uid, item]));
    const choiceByUid = new Map<string, LabosDigestChoiceValue>(
      choices.map((c) => [c.newsItemUid, toChoiceValue(c.choice)])
    );
    const followedTeams = new Set(follows.map((f) => f.entityUid));
    const commentsByUid = new Map(comments.map((c) => [c.newsItemUid, c._count._all]));
    const stories = link.n.flatMap((uid, position): LabosDigestPage['stories'] => {
      const item = itemByUid.get(uid);
      if (!item) return [];
      return [
        {
          uid: item.uid,
          position,
          isTopStory: link.l === item.uid,
          title: item.title,
          summary: item.summary,
          contentHtml: item.contentHtml,
          image: toNewsImageDto(item.image),
          imageUrl: item.imageUrl,
          sourceUrl: item.sourceUrl,
          sourceDomain: item.sourceDomain,
          teamUid: item.team.uid,
          teamName: item.team.name,
          teamLogoUrl: item.team.logo?.url ?? null,
          followsTeam: followedTeams.has(item.team.uid),
          sources: storySources(item.sourceUrl, item.sourceUrls),
          commentCount: commentsByUid.get(item.uid) ?? 0,
          eventType: item.eventType as NewsEventType,
          tags: item.tags,
          choice: choiceByUid.get(item.uid) ?? null,
        },
      ];
    });

    return {
      frequency: link.f,
      sentAt: link.s,
      firstName: member.name?.trim().split(/\s+/)[0] || null,
      stories,
      forumPosts: forum.posts,
      forumUnavailable: forum.unavailable,
      isTeamMember: activeRoles > 0,
      nextSendAt: nextDigestSendAt(link.f, now).toISOString(),
      topics: digestTopics(
        followedSlugs,
        choosable,
        vocabulary,
        new Map(topicScores.map((entry) => [entry.key, entry.score]))
      ),
    };
  }

  /**
   * Saves More or Less on one story of the link's digest, or undoes the active choice (`none`).
   * @throws DigestLinkError for a bad token; BadRequestException for a story that is not in the link.
   */
  async choose(
    token: string,
    newsItemUid: string,
    choice: LabosDigestChoiceValue | 'none'
  ): Promise<LabosDigestChoiceResponse> {
    const link = verifyDigestLinkToken(token);
    if (!link.n.includes(newsItemUid)) throw new BadRequestException('This story is not in the digest');

    const [item, vocabulary] = await Promise.all([
      this.prisma.teamNewsItem.findUnique({ where: { uid: newsItemUid }, select: { tags: true } }),
      this.tagVocabulary.getVocabulary(),
    ]);
    if (!item) throw new NotFoundException('Story not found');
    const topics = storyFocusTags(item.tags, (slug) => vocabulary.has(slug));

    const result = await this.prisma.$transaction((tx) => this.chooseLocked(tx, link, newsItemUid, choice, topics));
    if (result.changed) await this.cache.reset({ service: 'members' });
    return result;
  }

  private async chooseLocked(
    tx: Tx,
    link: DigestLinkPayload,
    newsItemUid: string,
    choice: LabosDigestChoiceValue | 'none',
    topics: string[]
  ): Promise<LabosDigestChoiceResponse> {
    // One writer per member at a time, so two fast presses can't interleave their read-modify-write of the weights.
    const locked = await tx.$queryRaw<{ uid: string }[]>`SELECT uid FROM "Member" WHERE uid = ${link.m} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Digest not found');

    const active = await tx.labosDigestChoice.findFirst({
      where: { memberUid: link.m, newsItemUid, undoneAt: null },
    });
    if (active && choice !== 'none' && toChoiceValue(active.choice) === choice) {
      return { newsItemUid, choice, changed: false };
    }
    // Rows saved before weights (the tag version on dev) have no weights to undo.
    const activeBefore = active ? jsonToWeights(active.beforeWeights) : undefined;
    const activeAfter = active ? jsonToWeights(active.afterWeights) : undefined;

    const slugs = [...new Set([...topics, ...Object.keys(activeBefore ?? {}), ...Object.keys(activeAfter ?? {})])];
    const initial = await readTopicWeights(tx, link.m, slugs);
    let current = initial;

    if (active) {
      if (activeBefore && activeAfter) {
        current = { ...current, ...undoChoiceWeights(current, activeBefore, activeAfter) };
      }
      await tx.labosDigestChoice.update({ where: { uid: active.uid }, data: { undoneAt: new Date() } });
    }

    if (choice === 'none') {
      await writeTopicWeights(tx, link.m, initial, current);
      return { newsItemUid, choice: null, changed: Boolean(active) };
    }

    const after = applyChoiceToWeights(current, topics, choice, DIGEST_CHOICE_WEIGHT_STEP);
    const before = Object.fromEntries(topics.map((slug) => [slug, current[slug] ?? 0]));
    await tx.labosDigestChoice.create({
      data: {
        memberUid: link.m,
        newsItemUid,
        choice: toChoiceKind(choice),
        beforeWeights: before,
        afterWeights: after,
        // Tag-era columns, kept until a later cleanup; a weights choice never touches tags.
        addedTags: [],
        removedTags: [],
        mutedAdded: [],
        mutedRemoved: [],
        afterNewsTags: [],
        afterMuted: [],
      },
    });
    const final = { ...current, ...after };
    await writeTopicWeights(tx, link.m, initial, final);
    return { newsItemUid, choice, changed: Boolean(active) || weightsDiffer(initial, final) };
  }
}

/** The member's `TOPIC` weights for these slugs. A slug with no row is left out (it reads as 0). */
async function readTopicWeights(tx: Tx, memberUid: string, slugs: string[]): Promise<TopicWeights> {
  if (slugs.length === 0) return {};
  const rows = await tx.memberInterestProfileEntry.findMany({
    where: { memberUid, kind: 'TOPIC', key: { in: slugs } },
    select: { key: true, score: true },
  });
  return Object.fromEntries(rows.map((row) => [row.key, row.score]));
}

/**
 * Writes the weights that changed: an upsert, or a delete for a weight below the profile's minimum (the rebuild
 * stores no such row either). Every other profile row stays.
 */
async function writeTopicWeights(tx: Tx, memberUid: string, before: TopicWeights, after: TopicWeights): Promise<void> {
  for (const [key, score] of Object.entries(after)) {
    if (!weightsDiffer({ [key]: before[key] ?? 0 }, { [key]: score })) continue;
    if (score < MIN_STORED_SCORE) {
      await tx.memberInterestProfileEntry.deleteMany({ where: { memberUid, kind: 'TOPIC', key } });
    } else {
      await tx.memberInterestProfileEntry.upsert({
        where: { memberUid_kind_key: { memberUid, kind: 'TOPIC', key } },
        create: { memberUid, kind: 'TOPIC', key, score },
        update: { score },
      });
    }
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LabosDigestChoiceKind, NewsEventType, Prisma } from '@prisma/client';
import type {
  LabosDigestChoiceResponse,
  LabosDigestChoiceValue,
  LabosDigestPage,
} from 'libs/contracts/src/schema/team-news';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';
import { NewsTagVocabularyService } from './news-tag-vocabulary.service';
import { LabosDigestForumReader } from './labos-digest-forum.reader';
import { DigestLinkPayload, verifyDigestLinkToken } from './labos-digest-link-token.util';
import { applyChoice, jsonToList, storyFocusTags, StoredNewsLists, undoChoice } from './labos-digest-choice.util';
import { readMutedNewsTags, readStoredNewsTags } from './utils/news-tags';
import { TEAM_NEWS_IMAGE_SELECT, toNewsImageDto } from './utils/news-image-variants';

const toChoiceValue = (kind: LabosDigestChoiceKind): LabosDigestChoiceValue => (kind === 'MORE' ? 'more' : 'less');
const toChoiceKind = (value: LabosDigestChoiceValue): LabosDigestChoiceKind => (value === 'more' ? 'MORE' : 'LESS');

type Tx = Prisma.TransactionClient;

/**
 * The public digest page (LAB-3263): reads one member's digest from a signed email link, and saves their
 * "More like this" / "Less like this" choices. Reading never changes anything, so email link scanners are safe.
 */
@Injectable()
export class LabosDigestPageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tagVocabulary: NewsTagVocabularyService,
    private readonly forum: LabosDigestForumReader,
    private readonly cache: CacheService
  ) {}

  /** @throws DigestLinkError for a bad token; NotFoundException when the member no longer exists. */
  async read(token: string): Promise<LabosDigestPage> {
    const link = verifyDigestLinkToken(token);
    const [member, items, choices, forum] = await Promise.all([
      this.prisma.member.findUnique({ where: { uid: link.m }, select: { name: true } }),
      this.prisma.teamNewsItem.findMany({
        where: { uid: { in: link.n } },
        select: {
          uid: true,
          title: true,
          summary: true,
          contentHtml: true,
          imageUrl: true,
          sourceUrl: true,
          sourceDomain: true,
          eventType: true,
          tags: true,
          team: { select: { uid: true, name: true } },
          ...TEAM_NEWS_IMAGE_SELECT,
        },
      }),
      this.prisma.labosDigestChoice.findMany({
        where: { memberUid: link.m, newsItemUid: { in: link.n }, undoneAt: null },
        select: { newsItemUid: true, choice: true },
      }),
      this.forum.read(link.p),
    ]);
    if (!member) throw new NotFoundException('Digest not found');

    const itemByUid = new Map(items.map((item) => [item.uid, item]));
    const choiceByUid = new Map<string, LabosDigestChoiceValue>(
      choices.map((c) => [c.newsItemUid, toChoiceValue(c.choice)])
    );
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
    const storyTags = storyFocusTags(item.tags, (slug) => vocabulary.has(slug));
    // Read outside the transaction: starting tags only matter for a member with no saved tags.
    const startingTags = await this.tagVocabulary.seedTagsForMember(link.m);

    const result = await this.prisma.$transaction((tx) =>
      this.chooseLocked(tx, link, newsItemUid, choice, storyTags, startingTags)
    );
    if (result.changed) await this.cache.reset({ service: 'members' });
    return result;
  }

  private async chooseLocked(
    tx: Tx,
    link: DigestLinkPayload,
    newsItemUid: string,
    choice: LabosDigestChoiceValue | 'none',
    storyTags: string[],
    startingTags: string[]
  ): Promise<LabosDigestChoiceResponse> {
    // One writer per member at a time, so two fast presses can't interleave their read-modify-write.
    const locked = await tx.$queryRaw<{ preferences: unknown }[]>`
      SELECT "preferences" FROM "Member" WHERE uid = ${link.m} FOR UPDATE
    `;
    if (locked.length === 0) throw new NotFoundException('Digest not found');
    let current: StoredNewsLists = {
      newsTags: readStoredNewsTags(locked[0].preferences),
      muted: hasKey(locked[0].preferences, 'newsTagsMuted') ? readMutedNewsTags(locked[0].preferences) : undefined,
    };
    const initial = current;

    const active = await tx.labosDigestChoice.findFirst({
      where: { memberUid: link.m, newsItemUid, undoneAt: null },
    });
    if (active && choice !== 'none' && toChoiceValue(active.choice) === choice) {
      return { newsItemUid, choice, changed: false };
    }
    if (active) {
      current = undoChoice(current, {
        before: { newsTags: jsonToList(active.beforeNewsTags), muted: jsonToList(active.beforeMuted) },
        after: { newsTags: jsonToList(active.afterNewsTags) ?? [], muted: jsonToList(active.afterMuted) ?? [] },
        delta: {
          addedTags: active.addedTags,
          removedTags: active.removedTags,
          mutedAdded: active.mutedAdded,
          mutedRemoved: active.mutedRemoved,
        },
      });
      await tx.labosDigestChoice.update({ where: { uid: active.uid }, data: { undoneAt: new Date() } });
    }

    if (choice === 'none') {
      await writeLists(tx, link.m, initial, current);
      return { newsItemUid, choice: null, changed: Boolean(active) };
    }

    const applied = applyChoice(current, startingTags, storyTags, choice);
    await tx.labosDigestChoice.create({
      data: {
        memberUid: link.m,
        newsItemUid,
        choice: toChoiceKind(choice),
        ...applied.delta,
        beforeNewsTags: current.newsTags ?? Prisma.DbNull,
        beforeMuted: current.muted ?? Prisma.DbNull,
        afterNewsTags: applied.after.newsTags,
        afterMuted: applied.after.muted,
      },
    });
    await writeLists(tx, link.m, initial, applied.after);
    return { newsItemUid, choice, changed: applied.changed || Boolean(active) };
  }
}

function hasKey(preferences: unknown, key: string): boolean {
  return Boolean(preferences && typeof preferences === 'object' && key in (preferences as object));
}

/**
 * Writes `newsTags` and `newsTagsMuted` with a top-level jsonb merge (every other preference stays), removing a
 * key whose new value is `undefined`. Skips the write when nothing changed.
 */
async function writeLists(tx: Tx, memberUid: string, before: StoredNewsLists, after: StoredNewsLists): Promise<void> {
  const same = (a?: string[], b?: string[]) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (same(before.newsTags, after.newsTags) && same(before.muted, after.muted)) return;
  const set: Record<string, string[]> = {};
  const remove: string[] = [];
  if (after.newsTags === undefined) remove.push('newsTags');
  else set.newsTags = after.newsTags;
  if (after.muted === undefined) remove.push('newsTagsMuted');
  else set.newsTagsMuted = after.muted;
  await tx.$executeRaw`
    UPDATE "Member"
    SET "preferences" = (COALESCE("preferences", '{}'::jsonb) - ${remove}::text[]) || ${JSON.stringify(set)}::jsonb
    WHERE uid = ${memberUid}
  `;
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { LabosDigestChoiceKind, LabosDigestFrequency, NewsEventType, Prisma } from '@prisma/client';
import type {
  LabosDigestChoiceResponse,
  LabosDigestChoiceValue,
  LabosDigestPage,
  LabosDigestPageForumPost,
  LabosDigestNetworkNews,
  LabosDigestPageIssue,
  LabosDigestPageSource,
  RecordLabosDigestIssuesRequest,
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
import { excludedTeamsWhere } from './labos-digest.service';
import { hidesEventAttendance, listedGuestsWhereIn } from '../pl-events/pl-event-detail';
import { upcomingEventsFindArgs } from '../pl-events/upcoming-events-query';
import { readChosenNewsTags } from './utils/news-tags';

const toChoiceValue = (kind: LabosDigestChoiceKind): LabosDigestChoiceValue => (kind === 'MORE' ? 'more' : 'less');
const toChoiceKind = (value: LabosDigestChoiceValue): LabosDigestChoiceKind => (value === 'more' ? 'MORE' : 'LESS');
const toFrequencyKind = (value: 'daily' | 'weekly'): LabosDigestFrequency => (value === 'weekly' ? 'WEEKLY' : 'DAILY');
const toFrequencyValue = (kind: LabosDigestFrequency): 'daily' | 'weekly' => (kind === 'WEEKLY' ? 'weekly' : 'daily');
const sameInstant = (a: string, b: string): boolean => Date.parse(a) === Date.parse(b);

/** More from the network (LAB-3291): how many rows, and how far before the issue's send time they may be added. */
export const NETWORK_NEWS_LIMIT = 5;
export const NETWORK_NEWS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Upcoming events (LAB-3292): how far ahead, and how many rows. */
export const EVENTS_WINDOW_DAYS = 28;
export const EVENTS_LIMIT = 5;

/** How many issues Past issues lists (LAB-3294). */
export const PAST_ISSUES_LIMIT = 8;

/** One issue's content, as the link token carries it, with its recorded id when there is one (LAB-3356). */
type DigestIssue = Pick<DigestLinkPayload, 'f' | 's' | 'n' | 'l' | 'p'> & { uid?: string };

/**
 * Who reads the page (LAB-3356). `null` is a signed-out reader: no member data at all. Only a reader with
 * `canReadForum` gets the forum posts (LAB-3355).
 */
export type DigestViewer = { uid: string; canReadForum: boolean } | null;

/**
 * The forum part of the page for a reader who may not read the forum (LAB-3355): no posts at all, so no title, reply
 * count or URL reaches them, and no forum call is made for them. Not "unavailable": there is just nothing to show.
 */
const NO_FORUM = { posts: [] as LabosDigestPageForumPost[], unavailable: false };

type Tx = Prisma.TransactionClient;

/** A recorded issue row as the page reads it. */
function issueFromRow(row: {
  uid: string;
  frequency: LabosDigestFrequency;
  sentAt: Date;
  newsItemUids: string[];
  leadUid: string | null;
  forumTids: number[];
}): DigestIssue {
  return {
    uid: row.uid,
    f: toFrequencyValue(row.frequency),
    s: row.sentAt.toISOString(),
    n: row.newsItemUids,
    l: row.leadUid ?? undefined,
    p: row.forumTids,
  };
}

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
 * The public digest page (LAB-3263). LAB-3356: a signed email link only opens an issue (`exchange`); the issue is
 * then read by id with the signed-in reader's own data, or none signed out, and "More like this" / "Less like this"
 * save for the signed-in member only. Reading never changes anything but the exchange's issue record, so email link
 * scanners are safe. A choice moves the member's interest profile topic weights; it never changes their saved tags.
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

  /**
   * DEPRECATED (LAB-3356): the link's digest, or with `issueKey` (a send time) one of the same member's past issues
   * (LAB-3294), read as the link's member. Kept for one release so an open old page still loads; the page now uses
   * `exchange` and `readIssueByUid`.
   * @throws DigestLinkError for a bad token; NotFoundException when the member or that issue doesn't exist.
   */
  async read(token: string, issueKey?: string): Promise<LabosDigestPage> {
    const link = verifyDigestLinkToken(token);
    const issue = await this.issueOf(link, issueKey);
    const own: DigestIssue = { f: link.f, s: link.s, n: link.n, l: link.l, p: link.p };
    return this.readIssue(issue, { uid: link.m, canReadForum: true }, this.listIssues(link.m, own, true));
  }

  /**
   * LAB-3356: swaps a link for the id of its issue, recording the issue when the notification service didn't
   * (best effort). With `issueKey` (a send time from an older Past issues link), the link member's recorded issue
   * sent then. Changes no choice or setting.
   * @throws DigestLinkError for a bad token; NotFoundException for an unknown member or past issue.
   */
  async exchange(token: string, issueKey?: string): Promise<{ issueUid: string }> {
    const link = verifyDigestLinkToken(token);
    if (issueKey && !sameInstant(issueKey, link.s)) {
      const row = await this.prisma.labosDigestIssue.findFirst({
        where: { memberUid: link.m, sentAt: new Date(issueKey) },
        orderBy: { createdAt: 'desc' },
        select: { uid: true },
      });
      if (!row) throw new NotFoundException('Issue not found');
      return { issueUid: row.uid };
    }
    const member = await this.prisma.member.findUnique({ where: { uid: link.m }, select: { uid: true } });
    if (!member) throw new NotFoundException('Digest not found');
    const frequency = toFrequencyKind(link.f);
    const sentAt = new Date(link.s);
    // The row the send recorded, or a new one from the link's own fields. An existing row is never changed.
    const row = await this.prisma.labosDigestIssue.upsert({
      where: { memberUid_frequency_sentAt: { memberUid: link.m, frequency, sentAt } },
      create: {
        memberUid: link.m,
        frequency,
        sentAt,
        newsItemUids: link.n,
        leadUid: link.l && link.n.includes(link.l) ? link.l : null,
        forumTids: link.p,
      },
      update: {},
      select: { uid: true },
    });
    return { issueUid: row.uid };
  }

  /**
   * LAB-3356: one issue by id, for anyone. `viewer` is the signed-in member reading it (any member, not only the
   * one it was sent to), or null signed out: then no name, choices, follows, topics or Past issues. Forum posts only
   * for a viewer who may read the forum (LAB-3355).
   * @throws NotFoundException for an unknown issue.
   */
  async readIssueByUid(issueUid: string, viewer: DigestViewer): Promise<LabosDigestPage> {
    const row = await this.prisma.labosDigestIssue.findUnique({ where: { uid: issueUid } });
    if (!row) throw new NotFoundException('Issue not found');
    const issue = issueFromRow(row);
    const pastIssues = viewer ? this.listIssues(viewer.uid, issue, row.memberUid === viewer.uid) : Promise.resolve([]);
    return this.readIssue(issue, viewer, pastIssues);
  }

  /** One issue as `viewer` sees it. The token read and the issue read share it, so the two can't drift. */
  private async readIssue(
    issue: DigestIssue,
    viewer: DigestViewer,
    pastIssues: Promise<LabosDigestPageIssue[]>
  ): Promise<LabosDigestPage> {
    const now = new Date();
    const [
      member,
      items,
      choices,
      forum,
      follows,
      comments,
      activeRoles,
      vocabulary,
      choosable,
      topicScores,
      issues,
      networkNews,
      events,
    ] = await Promise.all([
      viewer
        ? this.prisma.member.findUnique({ where: { uid: viewer.uid }, select: { name: true, preferences: true } })
        : null,
      this.prisma.teamNewsItem.findMany({
        where: { uid: { in: issue.n } },
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
      viewer
        ? this.prisma.labosDigestChoice.findMany({
            where: { memberUid: viewer.uid, newsItemUid: { in: issue.n }, undoneAt: null },
            select: { newsItemUid: true, choice: true },
          })
        : ([] as { newsItemUid: string; choice: LabosDigestChoiceKind }[]),
      viewer?.canReadForum ? this.forum.read(issue.p) : NO_FORUM,
      viewer
        ? this.prisma.follow.findMany({
            where: { memberUid: viewer.uid, entityType: 'TEAM' },
            select: { entityUid: true },
          })
        : ([] as { entityUid: string }[]),
      this.prisma.feedComment.groupBy({
        by: ['newsItemUid'],
        where: { newsItemUid: { in: issue.n } },
        _count: { _all: true },
      }),
      viewer
        ? this.prisma.teamMemberRole.count({
            where: { memberUid: viewer.uid, OR: [{ endDate: null }, { endDate: { gte: now } }] },
          })
        : 0,
      this.tagVocabulary.getVocabulary(),
      this.newsQuery.listNewsTags(now),
      viewer
        ? this.prisma.memberInterestProfileEntry.findMany({
            where: { memberUid: viewer.uid, kind: 'TOPIC' },
            select: { key: true, score: true },
          })
        : ([] as { key: string; score: number }[]),
      pastIssues,
      this.listNetworkNews(issue),
      this.listUpcomingEvents(now),
    ]);
    if (viewer && !member) throw new NotFoundException('Digest not found');
    // Same tags News preferences shows as ticked: the saved list, else the starting tags. Reading stores nothing.
    // Signed out there are none, so every offered tag is suggested, by title (no weights to order by).
    const followedSlugs =
      viewer && member
        ? readChosenNewsTags(member.preferences) ?? (await this.tagVocabulary.seedTagsForMember(viewer.uid))
        : [];

    const itemByUid = new Map(items.map((item) => [item.uid, item]));
    const choiceByUid = new Map<string, LabosDigestChoiceValue>(
      choices.map((c) => [c.newsItemUid, toChoiceValue(c.choice)])
    );
    const followedTeams = new Set(follows.map((f) => f.entityUid));
    const commentsByUid = new Map(comments.map((c) => [c.newsItemUid, c._count._all]));
    const stories = issue.n.flatMap((uid, position): LabosDigestPage['stories'] => {
      const item = itemByUid.get(uid);
      if (!item) return [];
      return [
        {
          uid: item.uid,
          position,
          isTopStory: issue.l === item.uid,
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
      frequency: issue.f,
      sentAt: issue.s,
      firstName: member?.name?.trim().split(/\s+/)[0] || null,
      stories,
      forumPosts: forum.posts,
      forumUnavailable: forum.unavailable,
      isTeamMember: activeRoles > 0,
      nextSendAt: nextDigestSendAt(issue.f, now).toISOString(),
      issues,
      networkNews,
      events,
      topics: digestTopics(
        followedSlugs,
        choosable,
        vocabulary,
        new Map(topicScores.map((entry) => [entry.key, entry.score]))
      ),
    };
  }

  /**
   * LAB-3356: saves More or Less on one story of the issue for the signed-in member, or undoes their active choice
   * (`none`). Any member may choose on any issue they can open; it only ever changes their own weights.
   * @throws NotFoundException for an unknown issue or story; BadRequestException for a story not in the issue.
   */
  async chooseByIssue(
    issueUid: string,
    memberUid: string,
    newsItemUid: string,
    choice: LabosDigestChoiceValue | 'none'
  ): Promise<LabosDigestChoiceResponse> {
    const row = await this.prisma.labosDigestIssue.findUnique({
      where: { uid: issueUid },
      select: { newsItemUids: true },
    });
    if (!row) throw new NotFoundException('Issue not found');
    if (!row.newsItemUids.includes(newsItemUid)) throw new BadRequestException('This story is not in the digest');

    const [item, vocabulary] = await Promise.all([
      this.prisma.teamNewsItem.findUnique({ where: { uid: newsItemUid }, select: { tags: true } }),
      this.tagVocabulary.getVocabulary(),
    ]);
    if (!item) throw new NotFoundException('Story not found');
    const topics = storyFocusTags(item.tags, (slug) => vocabulary.has(slug));

    const result = await this.prisma.$transaction((tx) =>
      this.chooseLocked(tx, memberUid, newsItemUid, choice, topics)
    );
    if (result.changed) await this.cache.reset({ service: 'members' });
    return result;
  }

  /**
   * Records the issues the notification service sent (LAB-3294), once each: a repeat of the same member, frequency
   * and send time is skipped. Issues of members that no longer exist are left out.
   */
  async recordIssues(issues: RecordLabosDigestIssuesRequest['issues']): Promise<{ recorded: number }> {
    const known = new Set(
      (
        await this.prisma.member.findMany({
          where: { uid: { in: [...new Set(issues.map((i) => i.memberUid))] } },
          select: { uid: true },
        })
      ).map((m) => m.uid)
    );
    const { count } = await this.prisma.labosDigestIssue.createMany({
      data: issues
        .filter((i) => known.has(i.memberUid))
        .map((i) => ({
          memberUid: i.memberUid,
          frequency: toFrequencyKind(i.frequency),
          sentAt: new Date(i.sentAt),
          newsItemUids: i.n,
          leadUid: i.l && i.n.includes(i.l) ? i.l : null,
          forumTids: i.p,
        })),
      skipDuplicates: true,
    });
    return { recorded: count };
  }

  /**
   * More from the network (LAB-3291): ingested press (not posted by a member) about network teams, added in the week
   * before the issue went out, that isn't one of the issue's stories. Teams the feed hides are left out. Newest event
   * first, at most NETWORK_NEWS_LIMIT.
   */
  private async listNetworkNews(issue: DigestIssue): Promise<LabosDigestNetworkNews[]> {
    const sentAt = new Date(issue.s);
    const excluded = excludedTeamsWhere();
    const rows = await this.prisma.teamNewsItem.findMany({
      where: {
        postedByMemberUid: null,
        createdAt: { gt: new Date(sentAt.getTime() - NETWORK_NEWS_WINDOW_MS), lte: sentAt },
        uid: { notIn: issue.n },
        ...(excluded ?? {}),
      },
      orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
      take: NETWORK_NEWS_LIMIT,
      select: {
        uid: true,
        title: true,
        sourceUrl: true,
        sourceDomain: true,
        imageUrl: true,
        eventDate: true,
        team: { select: { name: true } },
        ...TEAM_NEWS_IMAGE_SELECT,
      },
    });
    return rows.map((row) => ({
      uid: row.uid,
      title: row.title,
      url: row.sourceUrl,
      domain: row.sourceDomain ?? extractDomain(row.sourceUrl) ?? null,
      image: toNewsImageDto(row.image),
      imageUrl: row.imageUrl,
      eventDate: row.eventDate.toISOString(),
      teamName: row.team.name,
    }));
  }

  /**
   * Upcoming events (LAB-3292): events starting in the next EVENTS_WINDOW_DAYS from now (not from the issue: a past
   * issue still shows what's coming), by Home's events rail query, soonest first, at most EVENTS_LIMIT, with the
   * window's total for "See all". Going counts follow the event drawer's rule; the page reads as signed out, so
   * invite-only events hide theirs.
   */
  private async listUpcomingEvents(now: Date): Promise<LabosDigestPage['events']> {
    const { where, orderBy, take } = upcomingEventsFindArgs(
      { days: EVENTS_WINDOW_DAYS, limit: EVENTS_LIMIT, sort: 'soonest' },
      now
    );
    const [rows, total] = await Promise.all([
      // pl-event-visibility: `where` comes from upcomingEventsFindArgs, which applies VISIBLE_PL_EVENT_WHERE.
      this.prisma.pLEvent.findMany({
        where,
        orderBy,
        take,
        select: {
          uid: true,
          name: true,
          startDate: true,
          endDate: true,
          locationUid: true,
          externalId: true,
          type: true,
          accessOption: true,
          logo: { select: { url: true } },
          location: { select: { location: true } },
        },
      }),
      // pl-event-visibility: the same `where` as the list above.
      this.prisma.pLEvent.count({ where }),
    ]);
    const counted = rows.filter((row) => !hidesEventAttendance(row, false)).map((row) => row.uid);
    const going = counted.length
      ? await this.prisma.pLEventGuest.groupBy({ by: ['eventUid', 'memberUid'], where: listedGuestsWhereIn(counted) })
      : [];
    return {
      total,
      items: rows.map((row) => ({
        uid: row.uid,
        name: row.name,
        startDate: row.startDate.toISOString(),
        endDate: row.endDate.toISOString(),
        location: row.location?.location ?? null,
        locationUid: row.locationUid ?? null,
        externalId: row.externalId ?? null,
        logoUrl: row.logo?.url ?? null,
        type: row.type ?? null,
        goingCount: counted.includes(row.uid) ? going.filter((g) => g.eventUid === row.uid).length : null,
      })),
    };
  }

  /** The link's own issue, or the member's stored issue sent at `issueKey`. */
  private async issueOf(link: DigestLinkPayload, issueKey?: string): Promise<DigestIssue> {
    const own: DigestIssue = { f: link.f, s: link.s, n: link.n, l: link.l, p: link.p };
    if (!issueKey || sameInstant(issueKey, link.s)) return own;
    const row = await this.prisma.labosDigestIssue.findFirst({
      where: { memberUid: link.m, sentAt: new Date(issueKey) },
      orderBy: { createdAt: 'desc' },
    });
    if (!row) throw new NotFoundException('Issue not found');
    return issueFromRow(row);
  }

  /**
   * The member's latest issues, newest first, at most PAST_ISSUES_LIMIT, with `isLinkIssue` on `current` (matched by
   * id when it has one, else by send time). With `keepCurrent` it is always listed, even when it was sent before
   * issues were recorded (then its `uid` is null). Each is titled by its top story, else its first story.
   */
  private async listIssues(
    memberUid: string,
    current: DigestIssue,
    keepCurrent: boolean
  ): Promise<LabosDigestPageIssue[]> {
    const rows = await this.prisma.labosDigestIssue.findMany({
      where: { memberUid },
      orderBy: { sentAt: 'desc' },
      take: PAST_ISSUES_LIMIT,
      select: { uid: true, frequency: true, sentAt: true, newsItemUids: true, leadUid: true },
    });
    const isCurrent = (row: { uid: string; sentAt: Date }) =>
      current.uid ? row.uid === current.uid : sameInstant(row.sentAt.toISOString(), current.s);
    const listed = rows.map((row) => ({
      uid: row.uid as string | null,
      sentAt: row.sentAt.toISOString(),
      frequency: toFrequencyValue(row.frequency),
      titleUid: row.leadUid ?? row.newsItemUids[0] ?? null,
      isLinkIssue: isCurrent(row),
    }));
    if (keepCurrent && !listed.some((issue) => issue.isLinkIssue)) {
      listed.push({
        uid: current.uid ?? null,
        sentAt: new Date(current.s).toISOString(),
        frequency: current.f,
        titleUid: current.l ?? current.n[0] ?? null,
        isLinkIssue: true,
      });
      listed.sort((a, b) => Date.parse(b.sentAt) - Date.parse(a.sentAt));
      // One too many now: drop the oldest that isn't the current one, so the current one stays listed.
      if (listed.length > PAST_ISSUES_LIMIT) {
        const oldest = listed.map((issue) => issue.isLinkIssue).lastIndexOf(false);
        listed.splice(oldest, 1);
      }
    }
    const titleUids = [...new Set(listed.flatMap((issue) => (issue.titleUid ? [issue.titleUid] : [])))];
    const titles = new Map(
      (
        await this.prisma.teamNewsItem.findMany({
          where: { uid: { in: titleUids } },
          select: { uid: true, title: true },
        })
      ).map((item) => [item.uid, item.title])
    );
    return listed.map(({ titleUid, ...issue }) => ({ ...issue, title: (titleUid && titles.get(titleUid)) || null }));
  }

  private async chooseLocked(
    tx: Tx,
    memberUid: string,
    newsItemUid: string,
    choice: LabosDigestChoiceValue | 'none',
    topics: string[]
  ): Promise<LabosDigestChoiceResponse> {
    // One writer per member at a time, so two fast presses can't interleave their read-modify-write of the weights.
    const locked = await tx.$queryRaw<{ uid: string }[]>`SELECT uid FROM "Member" WHERE uid = ${memberUid} FOR UPDATE`;
    if (locked.length === 0) throw new NotFoundException('Digest not found');

    const active = await tx.labosDigestChoice.findFirst({
      where: { memberUid, newsItemUid, undoneAt: null },
    });
    if (active && choice !== 'none' && toChoiceValue(active.choice) === choice) {
      return { newsItemUid, choice, changed: false };
    }
    // Rows saved before weights (the tag version on dev) have no weights to undo.
    const activeBefore = active ? jsonToWeights(active.beforeWeights) : undefined;
    const activeAfter = active ? jsonToWeights(active.afterWeights) : undefined;

    const slugs = [...new Set([...topics, ...Object.keys(activeBefore ?? {}), ...Object.keys(activeAfter ?? {})])];
    const initial = await readTopicWeights(tx, memberUid, slugs);
    let current = initial;

    if (active) {
      if (activeBefore && activeAfter) {
        current = { ...current, ...undoChoiceWeights(current, activeBefore, activeAfter) };
      }
      await tx.labosDigestChoice.update({ where: { uid: active.uid }, data: { undoneAt: new Date() } });
    }

    if (choice === 'none') {
      await writeTopicWeights(tx, memberUid, initial, current);
      return { newsItemUid, choice: null, changed: Boolean(active) };
    }

    const after = applyChoiceToWeights(current, topics, choice, DIGEST_CHOICE_WEIGHT_STEP);
    const before = Object.fromEntries(topics.map((slug) => [slug, current[slug] ?? 0]));
    await tx.labosDigestChoice.create({
      data: {
        memberUid,
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
    await writeTopicWeights(tx, memberUid, initial, final);
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

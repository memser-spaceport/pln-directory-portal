import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { LabosDigestFrequency, LabosDigestPickSource, Prisma } from '@prisma/client';
import { EDITORIAL_RANK_LIMIT } from './team-news-trending-seed.util';
import { TEAM_NEWS_EXCLUDED_TEAM_NAMES } from './team-news-public-list.config';
import { extractDomain } from './utils/url-normalize';
import { isSafeHttpUrl } from './team-news-body-html.util';
import { TeamNewsService } from './team-news.service';
import { PrismaService } from '../shared/prisma.service';
import type {
  LabosDigestFoundNewsResponse,
  LabosDigestFrequency as LabosDigestFrequencyName,
  LabosDigestNewsDetail,
  LabosDigestNewsQuery,
  LabosDigestPickSource as LabosDigestPickSourceName,
  LabosDigestSendList,
  LabosDigestSendsQuery,
  LabosDigestServiceNewsResponse,
  LabosDigestStory,
  LabosDigestView,
  PostLabosDigestNews,
  RecordLabosDigestSend,
  RecordLabosDigestSendResponse,
  UpdateLabosDigestNews,
} from 'libs/contracts/src/schema/team-news';

export const LABOS_DIGEST_OVERRIDE_ID = 'current';
export const LABOS_DIGEST_CHANNEL = 'forum-digest';
const WINDOW_DAYS = 14;

const STORY_SELECT = {
  uid: true,
  title: true,
  summary: true,
  sourceDomain: true,
  sourceUrl: true,
  eventDate: true,
  tags: true,
  teamUid: true,
  team: { select: { uid: true, name: true } },
} as const;

const NEWS_DETAIL_SELECT = {
  uid: true,
  title: true,
  summary: true,
  contentHtml: true,
  sourceUrl: true,
  sourceUrls: true,
  sourceDomain: true,
  imageUrl: true,
  eventDate: true,
  tags: true,
  team: { select: { uid: true, name: true } },
} as const;

type NewsDetailRow = Prisma.TeamNewsItemGetPayload<{ select: typeof NEWS_DETAIL_SELECT }>;

type StoryRow = Prisma.TeamNewsItemGetPayload<{ select: typeof STORY_SELECT }>;

export type DigestTopSelection = {
  source: LabosDigestPickSourceName;
  uids: string[];
  overrideUpdatedAt: string | null;
};

@Injectable()
export class LabosDigestService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly teamNews?: TeamNewsService
  ) {}

  async getView(): Promise<LabosDigestView> {
    const [selection, states] = await Promise.all([
      this.selectForDigest(),
      this.prisma.labosDigestFrequencyState.findMany(),
    ]);
    const stories = await this.loadStories(selection.uids, selection.source);
    return {
      source: selection.source,
      stories,
      overrideUpdatedAt: selection.overrideUpdatedAt,
      daily: this.preview('daily', stories, selection.source, states),
      weekly: this.preview('weekly', stories, selection.source, states),
    };
  }

  /**
   * The ordered Top stories the next digest will feature. When `frequency` is
   * set, stores the lead that frequency already showed so the page can preview
   * the skip rule.
   */
  async selectForDigest(input?: {
    frequency?: LabosDigestFrequencyName;
    lastShownLeadUid?: string | null;
  }): Promise<DigestTopSelection> {
    if (input?.frequency) {
      await this.noteLastLead(input.frequency, input.lastShownLeadUid ?? null);
    }

    const override = await this.prisma.labosDigestOverride.findUnique({
      where: { id: LABOS_DIGEST_OVERRIDE_ID },
    });
    if (override && override.newsItemUids.length > 0) {
      return {
        source: 'admin',
        uids: override.newsItemUids,
        overrideUpdatedAt: override.updatedAt.toISOString(),
      };
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const excluded = excludedTeamsWhere();
    const rows = await this.prisma.teamNewsItem.findMany({
      where: {
        editorialRank: { not: null, lte: EDITORIAL_RANK_LIMIT },
        eventDate: { gte: since },
        ...(excluded ?? {}),
      },
      orderBy: { editorialRank: 'asc' },
      take: EDITORIAL_RANK_LIMIT,
      select: { uid: true },
    });
    return { source: 'ai', uids: rows.map((row) => row.uid), overrideUpdatedAt: null };
  }

  async savePicks(newsItemUids: string[], setByMemberUid: string | null): Promise<LabosDigestView> {
    const uids = newsItemUids.map((uid) => uid.trim()).filter((uid) => uid.length > 0);
    if (uids.length < 1 || uids.length > EDITORIAL_RANK_LIMIT) {
      throw new BadRequestException(`Choose 1 to ${EDITORIAL_RANK_LIMIT} stories`);
    }
    if (new Set(uids).size !== uids.length) {
      throw new BadRequestException('A story can appear only once');
    }
    const found = await this.prisma.teamNewsItem.findMany({
      where: { uid: { in: uids } },
      select: { uid: true },
    });
    if (found.length !== uids.length) {
      throw new BadRequestException('One or more stories do not exist');
    }
    await this.prisma.labosDigestOverride.upsert({
      where: { id: LABOS_DIGEST_OVERRIDE_ID },
      create: { id: LABOS_DIGEST_OVERRIDE_ID, newsItemUids: uids, setByMemberUid },
      update: { newsItemUids: uids, setByMemberUid },
    });
    return this.getView();
  }

  async resetPicks(): Promise<LabosDigestView> {
    await this.prisma.labosDigestOverride.deleteMany({ where: { id: LABOS_DIGEST_OVERRIDE_ID } });
    return this.getView();
  }

  async listFoundNews(query: LabosDigestNewsQuery): Promise<LabosDigestFoundNewsResponse> {
    const where = newsWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.teamNewsItem.count({ where }),
      this.prisma.teamNewsItem.findMany({
        where,
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: { uid: true, title: true, summary: true, sourceDomain: true, eventDate: true, tags: true },
      }),
    ]);
    const history = await this.historyByItem(rows.map((row) => row.uid));
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => {
        const topStoryHistory = history.get(row.uid) ?? [];
        return {
          uid: row.uid,
          title: row.title,
          summary: row.summary,
          source: row.sourceDomain,
          date: row.eventDate.toISOString(),
          tags: row.tags,
          wasTopStory: topStoryHistory.length > 0,
          topStoryHistory,
        };
      }),
    };
  }

  async getNewsItem(uid: string): Promise<LabosDigestNewsDetail> {
    const row = await this.prisma.teamNewsItem.findUnique({
      where: { uid },
      select: NEWS_DETAIL_SELECT,
    });
    if (!row) throw new NotFoundException('News item not found');
    const history = await this.historyByItem([uid]);
    return toNewsDetail(row, history.get(uid) ?? []);
  }

  async updateNewsItem(uid: string, input: UpdateLabosDigestNews): Promise<LabosDigestNewsDetail> {
    const existing = await this.prisma.teamNewsItem.findUnique({ where: { uid }, select: { uid: true } });
    if (!existing) throw new NotFoundException('News item not found');
    const sourceUrls = uniqueHttpsUrls(input.sourceUrls);
    const sourceUrl = sourceUrls[0];
    await this.prisma.teamNewsItem.update({
      where: { uid },
      data: {
        title: input.title.trim(),
        summary: input.summary.trim() || null,
        sourceUrl,
        sourceUrls,
        sourceDomain: extractDomain(sourceUrl),
      },
    });
    return this.getNewsItem(uid);
  }

  async postNews(input: PostLabosDigestNews, memberUid: string): Promise<LabosDigestNewsDetail> {
    if (!this.teamNews) {
      throw new BadRequestException('News posting is not available');
    }
    const { uid } = await this.teamNews.createTeamPostedNews(
      input.teamUid,
      { title: input.title, body: input.body, url: input.url },
      { uid: memberUid, isDirectoryAdmin: true }
    );
    return this.getNewsItem(uid);
  }

  async listServiceNews(query: LabosDigestNewsQuery): Promise<LabosDigestServiceNewsResponse> {
    const where = newsWhere(query);
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.teamNewsItem.count({ where }),
      this.prisma.teamNewsItem.findMany({
        where,
        orderBy: [{ eventDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: query.limit,
        select: {
          uid: true,
          title: true,
          summary: true,
          sourceDomain: true,
          sourceUrl: true,
          eventDate: true,
          tags: true,
          team: { select: { uid: true, name: true } },
        },
      }),
    ]);
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map((row) => ({
        uid: row.uid,
        title: row.title,
        summary: row.summary,
        source: row.sourceDomain,
        link: row.sourceUrl,
        date: row.eventDate.toISOString(),
        tags: row.tags,
        team: { uid: row.team.uid, name: row.team.name },
      })),
    };
  }

  async listSends(query: LabosDigestSendsQuery): Promise<LabosDigestSendList> {
    const where: Prisma.LabosDigestSendWhereInput = {};
    if (query.frequency) where.frequency = toFrequency(query.frequency);
    const skip = (query.page - 1) * query.limit;
    const [total, rows] = await Promise.all([
      this.prisma.labosDigestSend.count({ where }),
      this.prisma.labosDigestSend.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: query.limit,
        include: sendInclude,
      }),
    ]);
    return {
      page: query.page,
      limit: query.limit,
      total,
      items: rows.map(toSend),
    };
  }

  async getSend(uid: string) {
    const row = await this.prisma.labosDigestSend.findUnique({
      where: { id: uid },
      include: sendInclude,
    });
    if (!row) throw new NotFoundException('Digest send not found');
    return toSend(row);
  }

  async recordSend(input: RecordLabosDigestSend): Promise<RecordLabosDigestSendResponse> {
    const sentAt = new Date(input.sentAt);
    if (Number.isNaN(sentAt.getTime())) {
      throw new BadRequestException('sentAt is not a date');
    }
    const existingUids = new Set(
      (
        await this.prisma.teamNewsItem.findMany({
          where: { uid: { in: input.storyUids } },
          select: { uid: true },
        })
      ).map((row) => row.uid)
    );
    const storyUids = input.storyUids.filter((uid) => existingUids.has(uid));
    const send = await this.prisma.labosDigestSend.create({
      data: {
        frequency: toFrequency(input.frequency),
        sentAt,
        source: toSource(input.source),
        channel: LABOS_DIGEST_CHANNEL,
        stories: {
          create: storyUids.map((uid, index) => ({
            newsItemUid: uid,
            position: index + 1,
            isLead: input.leadNewsItemUid === uid,
          })),
        },
      },
    });
    await this.noteLastLead(input.frequency, input.lastShownLeadUid);

    let clearedOverride = false;
    if (input.source === 'admin' && input.overrideUpdatedAt) {
      const override = await this.prisma.labosDigestOverride.findUnique({
        where: { id: LABOS_DIGEST_OVERRIDE_ID },
      });
      if (override && override.updatedAt.toISOString() === input.overrideUpdatedAt) {
        await this.prisma.labosDigestOverride.delete({ where: { id: LABOS_DIGEST_OVERRIDE_ID } });
        clearedOverride = true;
      }
    }
    return { uid: send.id, clearedOverride };
  }

  private async noteLastLead(frequency: LabosDigestFrequencyName, lastLeadNewsItemUid: string | null) {
    const key = toFrequency(frequency);
    await this.prisma.labosDigestFrequencyState.upsert({
      where: { frequency: key },
      create: { frequency: key, lastLeadNewsItemUid },
      update: { lastLeadNewsItemUid },
    });
  }

  private preview(
    frequency: LabosDigestFrequencyName,
    stories: LabosDigestStory[],
    source: LabosDigestPickSourceName,
    states: Array<{ frequency: LabosDigestFrequency; lastLeadNewsItemUid: string | null }>
  ): LabosDigestView['daily'] {
    const state = states.find((row) => row.frequency === toFrequency(frequency));
    const first = stories[0] ?? null;
    const lastLeadNewsItemUid = state?.lastLeadNewsItemUid ?? null;
    const skipped = source === 'ai' && !!first && lastLeadNewsItemUid === first.uid;
    return {
      frequency,
      leadIncluded: !!first && !skipped,
      leadUid: !first || skipped ? null : first.uid,
      lastLeadNewsItemUid,
    };
  }

  private async loadStories(uids: string[], source: LabosDigestPickSourceName): Promise<LabosDigestStory[]> {
    if (uids.length === 0) return [];
    const rows = await this.prisma.teamNewsItem.findMany({
      where: { uid: { in: uids } },
      select: STORY_SELECT,
    });
    const byUid = new Map(rows.map((row) => [row.uid, row]));
    const ordered: StoryRow[] = [];
    for (const uid of uids) {
      const row = byUid.get(uid);
      if (row) ordered.push(row);
    }
    return ordered.map((row, index) => toStory(row, index + 1, source));
  }

  private async historyByItem(uids: string[]) {
    const out = new Map<
      string,
      Array<{ frequency: LabosDigestFrequencyName; sentAt: string; position: number; isLead: boolean }>
    >();
    if (uids.length === 0) return out;
    const rows = await this.prisma.labosDigestSendStory.findMany({
      where: { newsItemUid: { in: uids } },
      include: { send: { select: { frequency: true, sentAt: true } } },
    });
    rows.sort((a, b) => b.send.sentAt.getTime() - a.send.sentAt.getTime());
    for (const row of rows) {
      const list = out.get(row.newsItemUid) ?? [];
      list.push({
        frequency: fromFrequency(row.send.frequency),
        sentAt: row.send.sentAt.toISOString(),
        position: row.position,
        isLead: row.isLead,
      });
      out.set(row.newsItemUid, list);
    }
    return out;
  }
}

const sendInclude = {
  stories: {
    orderBy: { position: 'asc' as const },
    include: { newsItem: { select: STORY_SELECT } },
  },
} as const;

type SendRow = Prisma.LabosDigestSendGetPayload<{ include: typeof sendInclude }>;

function toSend(row: SendRow): LabosDigestSendList['items'][number] {
  const source = fromSource(row.source);
  return {
    uid: row.id,
    frequency: fromFrequency(row.frequency),
    sentAt: row.sentAt.toISOString(),
    source,
    channel: row.channel,
    stories: row.stories.map((story) => toStory(story.newsItem, story.position, source)),
  };
}

function toNewsDetail(
  row: NewsDetailRow,
  topStoryHistory: LabosDigestNewsDetail['topStoryHistory']
): LabosDigestNewsDetail {
  const sourceUrls = row.sourceUrls.length > 0 ? row.sourceUrls : [row.sourceUrl];
  return {
    uid: row.uid,
    title: row.title,
    summary: row.summary,
    contentHtml: row.contentHtml,
    sourceUrl: row.sourceUrl,
    sourceUrls,
    sourceDomain: row.sourceDomain,
    imageUrl: row.imageUrl,
    eventDate: row.eventDate.toISOString(),
    tags: row.tags,
    team: { uid: row.team.uid, name: row.team.name },
    topStoryHistory,
  };
}

function uniqueHttpsUrls(urls: string[]): string[] {
  const unique = [...new Set(urls.map((url) => url.trim()).filter(Boolean))];
  if (unique.length === 0 || unique.some((url) => !isSafeHttpUrl(url))) {
    throw new BadRequestException('Each source must be a full http or https link');
  }
  return unique;
}

function toStory(row: StoryRow, position: number, source: LabosDigestPickSourceName): LabosDigestStory {
  return {
    position,
    source,
    uid: row.uid,
    title: row.title,
    summary: row.summary,
    sourceDomain: row.sourceDomain,
    sourceUrl: row.sourceUrl,
    eventDate: row.eventDate.toISOString(),
    tags: row.tags,
    teamUid: row.team.uid,
    teamName: row.team.name,
  };
}

function newsWhere(query: LabosDigestNewsQuery): Prisma.TeamNewsItemWhereInput {
  const from = query.from ? parseDate(query.from, 'from') : undefined;
  const to = query.to ? parseDate(query.to, 'to') : undefined;
  if (from && to && from > to) {
    throw new BadRequestException('from is after to');
  }
  const where: Prisma.TeamNewsItemWhereInput = {};
  if (from || to) where.eventDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  if (query.tags.length > 0) where.tags = { hasSome: query.tags };
  const q = query.q?.trim();
  if (q) {
    where.OR = [
      { title: { contains: q, mode: 'insensitive' } },
      { summary: { contains: q, mode: 'insensitive' } },
      { contentHtml: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

function parseDate(value: string, label: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label} is not a date`);
  }
  return date;
}

function excludedTeamsWhere(): Prisma.TeamNewsItemWhereInput | null {
  if (TEAM_NEWS_EXCLUDED_TEAM_NAMES.length > 0) {
    return {
      NOT: {
        OR: TEAM_NEWS_EXCLUDED_TEAM_NAMES.map((name) => ({
          team: { name: { equals: name, mode: 'insensitive' } },
        })),
      },
    };
  }
  return null;
}

function toFrequency(frequency: LabosDigestFrequencyName): LabosDigestFrequency {
  return frequency === 'daily' ? LabosDigestFrequency.DAILY : LabosDigestFrequency.WEEKLY;
}

function fromFrequency(frequency: LabosDigestFrequency): LabosDigestFrequencyName {
  return frequency === LabosDigestFrequency.DAILY ? 'daily' : 'weekly';
}

function toSource(source: LabosDigestPickSourceName): LabosDigestPickSource {
  return source === 'admin' ? LabosDigestPickSource.ADMIN : LabosDigestPickSource.AI;
}

function fromSource(source: LabosDigestPickSource): LabosDigestPickSourceName {
  return source === LabosDigestPickSource.ADMIN ? 'admin' : 'ai';
}

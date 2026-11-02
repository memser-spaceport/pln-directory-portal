import { NotFoundException } from '@nestjs/common';
import { z } from 'zod';
import {
  TeamNewsByTeamQueryParams,
  TeamNewsItemDto,
  TeamNewsListQueryParams,
} from 'libs/contracts/src/schema/team-news';
import { TeamNewsQueryService } from '../team-news/team-news-query.service';
import { TeamNewsSuggestionsService } from '../team-news/team-news-suggestions.service';
import { selectForYouNewsItems } from '../team-news/select-for-you-news-items';
import { McpToolDef } from './mcp-tools';

const NEWS_LIMIT_DEFAULT = 10;
const NEWS_LIMIT_MAX = 25;
/** How many recent items For You picks from: Home's window is 14 days, at most one story per For You team. */
const FOR_YOU_POOL = 200;

type NewsFeed = 'latest' | 'for_you';

function webUiBase(): string {
  return (process.env.WEB_UI_BASE_URL || '').replace(/\/+$/, '');
}

/** A compact news row, like the directory rows (`mcp-directory-viewer.ts`): no viewer or upvote fields. */
export function newsRow(item: TeamNewsItemDto) {
  return {
    uid: item.uid,
    title: item.title,
    summary: item.summary,
    eventType: item.eventType,
    eventDate: item.eventDate,
    teamUid: item.teamUid,
    teamName: item.teamName,
    url: `${webUiBase()}/home?news=${encodeURIComponent(item.uid)}`,
  };
}

function stringArg(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function intArg(value: unknown, fallback: number, max?: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.max(1, max ? Math.min(n, max) : n);
}

/** News feed tools (LAB-3015), both in the `news` scope at `read`. */
export function newsTools(query: TeamNewsQueryService, suggestions: TeamNewsSuggestionsService): McpToolDef[] {
  const latest = async (memberUid: string, q: string | undefined, page: number, limit: number) => {
    const { items, total } = await query.listTeamNews(
      TeamNewsListQueryParams.parse({ q, page, limit }),
      new Set(),
      memberUid
    );
    return { feed: 'latest' as NewsFeed, page, hasMore: page * limit < total, items: items.map(newsRow) };
  };

  return [
    {
      name: 'list_news',
      description:
        'List LabOS network news (team updates: funding, launches, partnerships, milestones), newest first. ' +
        'feed "latest" is Home → Latest; "for_you" is the member\'s For You picks (one latest story per suggested team; ' +
        "falls back to latest when there are none, and the result says which feed it used). teamUid lists one team's news. " +
        'Each row has a url to open the story in LabOS; call get_news_item for one story.',
      visibility: 'always',
      inputSchema: {
        feed: z.enum(['latest', 'for_you']).optional().describe('Default latest'),
        search: z.string().optional().describe('Text in the title or summary'),
        teamUid: z.string().optional().describe("Only this team's news"),
        limit: z.number().int().min(1).max(NEWS_LIMIT_MAX).optional().describe(`Default ${NEWS_LIMIT_DEFAULT}`),
        page: z.number().int().min(1).optional().describe('Default 1'),
      },
      execute: async (ctx, args = {}) => {
        const search = stringArg(args.search);
        const teamUid = stringArg(args.teamUid);
        const limit = intArg(args.limit, NEWS_LIMIT_DEFAULT, NEWS_LIMIT_MAX);
        const page = intArg(args.page, 1);

        if (teamUid) {
          const { items, total, teamName } = await query.listTeamNewsByTeam(
            teamUid,
            TeamNewsByTeamQueryParams.parse({ q: search, page, limit }),
            new Set(),
            ctx.memberUid
          );
          return { feed: 'latest', teamUid, teamName, page, hasMore: page * limit < total, items: items.map(newsRow) };
        }

        if (args.feed !== 'for_you') {
          return latest(ctx.memberUid, search, page, limit);
        }

        const teamUids = new Set(await suggestions.getForYouTeamUids(ctx.memberUid));
        if (teamUids.size > 0) {
          const { items } = await query.listTeamNews(
            TeamNewsListQueryParams.parse({ q: search, page: 1, limit: FOR_YOU_POOL }),
            new Set(),
            ctx.memberUid
          );
          const picked = selectForYouNewsItems(items, teamUids);
          if (picked.length > 0) {
            const start = (page - 1) * limit;
            return {
              feed: 'for_you',
              page,
              hasMore: start + limit < picked.length,
              items: picked.slice(start, start + limit).map(newsRow),
            };
          }
        }
        return latest(ctx.memberUid, search, page, limit);
      },
    },
    {
      name: 'get_news_item',
      description: 'Get one LabOS news story by uid, with its source link.',
      visibility: 'always',
      inputSchema: {
        uid: z.string().describe('News item uid from list_news'),
      },
      execute: async (ctx, args = {}) => {
        const uid = stringArg(args.uid);
        const item = uid ? await query.getTeamNewsItemDto(uid, new Set(), ctx.memberUid) : null;
        if (!item) {
          throw new NotFoundException(`News item not found: ${uid ?? ''}`);
        }
        return {
          ...newsRow(item),
          sourceUrl: item.sourceUrl,
          sourceDomain: item.sourceDomain,
          focusAreas: item.focusAreas,
          tags: item.tags,
        };
      },
    },
  ];
}

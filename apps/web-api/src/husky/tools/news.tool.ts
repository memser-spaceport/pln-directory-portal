import { Injectable } from '@nestjs/common';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { TeamNewsListQueryParams } from 'libs/contracts/src/schema/team-news';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { TeamNewsQueryService } from '../../team-news/team-news-query.service';
import { HuskyAuthContext } from './husky-auth-context';
import { longestWord, resolveFocusAreaTitles } from './fuzzy-match.util';

const EVENT_TYPES = ['FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ANNOUNCEMENT', 'MILESTONE', 'OTHER'] as const;

// "Recent news" for a single team is thin at the feed's 14-day default (often one item or
// none), so the tool looks back a quarter unless the model asks for a specific window.
export const DEFAULT_NEWS_WINDOW_DAYS = 90;

/**
 * Prepended to the tool result. Field labels below are for the model to read, not to
 * echo: without this the answer comes back as a run-on "Title: … Event Type: … Summary: …"
 * paragraph, or as a table whose summary column is unreadable.
 */
export const NEWS_PRESENTATION_HINT =
  'Present each news item as its own short entry: the title in bold with a citation to its [NewsLink] path, ' +
  'not the external Source URL, then the event type and date on one line, then a one-sentence summary. ' +
  'Do not repeat the field labels below, cite each item once, and do not use a table unless the user asks for one.';

const NewsToolParams = z.object({
  search: z.string().describe('Search term to look for in the news title, summary, or team name').optional(),
  eventType: z.enum(EVENT_TYPES).describe('Filter by news event type').optional(),
  focus: z.string().describe("Filter by the news team's focus area").optional(),
  windowDays: z
    .number()
    .describe(`How many days back to look for news (default ${DEFAULT_NEWS_WINDOW_DAYS}, max 365)`)
    .optional(),
});

@Injectable()
export class NewsTool {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private teamNewsQueryService: TeamNewsQueryService
  ) {}

  getTool(auth: HuskyAuthContext): CoreTool {
    return tool({
      description:
        'Search "News from the network" — recent team updates such as funding, launches, partnerships, and milestones',
      parameters: NewsToolParams,
      execute: (args) => this.execute(args, auth),
    });
  }

  private async execute(args: z.infer<typeof NewsToolParams>, auth: HuskyAuthContext) {
    this.logger.info(`Getting team news for args: ${JSON.stringify(args)}`);

    const baseArgs = {
      eventType: args.eventType ? [args.eventType] : undefined,
      focus: args.focus ? await resolveFocusAreaTitles(this.prisma, args.focus) : undefined,
      windowDays: args.windowDays ?? DEFAULT_NEWS_WINDOW_DAYS,
      limit: 15,
    };

    let { items } = await this.teamNewsQueryService.listTeamNews(
      TeamNewsListQueryParams.parse({ ...baseArgs, q: args.search }),
      new Set(),
      auth.memberUid
    );

    if (items.length === 0 && args.search) {
      const fallbackSearch = longestWord(args.search);
      if (fallbackSearch) {
        ({ items } = await this.teamNewsQueryService.listTeamNews(
          TeamNewsListQueryParams.parse({ ...baseArgs, q: fallbackSearch }),
          new Set(),
          auth.memberUid
        ));
      }
    }

    if (items.length === 0) {
      return 'No network news found matching the search criteria.';
    }

    const entries = items.map(
      (item) => `Team: ${item.teamName} [TeamLink](/teams/${item.teamUid})
                Title: ${item.title} [NewsLink](/home?news=${item.uid})
                Event Type: ${item.eventType}
                Date: ${item.eventDate.slice(0, 10)}
                Summary: ${item.summary || 'Not provided'}
                Focus Areas: ${item.focusAreas.join(', ') || 'Not provided'}
                Source: ${item.sourceUrl}`
    );
    return [NEWS_PRESENTATION_HINT, ...entries].join('\n\n');
  }
}

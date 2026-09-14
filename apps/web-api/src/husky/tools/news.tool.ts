import { Injectable } from '@nestjs/common';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { TeamNewsListQueryParams } from 'libs/contracts/src/schema/team-news';
import { LogService } from '../../shared/log.service';
import { TeamNewsQueryService } from '../../team-news/team-news-query.service';
import { HuskyAuthContext } from './husky-auth-context';

const EVENT_TYPES = ['FUNDING', 'LAUNCH', 'PARTNERSHIP', 'ANNOUNCEMENT', 'MILESTONE', 'OTHER'] as const;

const NewsToolParams = z.object({
  search: z.string().describe('Search term to look for in the news title, summary, or team name').optional(),
  eventType: z.enum(EVENT_TYPES).describe('Filter by news event type').optional(),
  focus: z.string().describe("Filter by the news team's focus area").optional(),
  windowDays: z.number().describe('How many days back to look for news (default 14, max 365)').optional(),
});

@Injectable()
export class NewsTool {
  constructor(private logger: LogService, private teamNewsQueryService: TeamNewsQueryService) {}

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

    const query = TeamNewsListQueryParams.parse({
      q: args.search,
      eventType: args.eventType ? [args.eventType] : undefined,
      focus: args.focus ? [args.focus] : undefined,
      windowDays: args.windowDays,
      limit: 15,
    });

    const { items } = await this.teamNewsQueryService.listTeamNews(query, new Set(), auth.memberUid);

    if (items.length === 0) {
      return 'No network news found matching the search criteria.';
    }

    return items
      .map(
        (item) => `Team: ${item.teamName} [TeamLink](/teams/${item.teamUid})
                Title: ${item.title}
                Event Type: ${item.eventType}
                Event Date: ${item.eventDate}
                Summary: ${item.summary || 'Not provided'}
                Focus Areas: ${item.focusAreas.join(', ') || 'Not provided'}
                Source: ${item.sourceUrl}`
      )
      .join('\n\n');
  }
}

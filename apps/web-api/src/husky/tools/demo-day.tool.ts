import { Injectable } from '@nestjs/common';
import { DemoDayStatus, Prisma } from '@prisma/client';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { DemoDaysService } from '../../demo-days/demo-days.service';
import { longestWord } from './fuzzy-match.util';

const DemoDayToolParams = z.object({
  demoDaySearch: z
    .string()
    .describe('Optional title/host search term to find a specific past demo day; defaults to the most recent one')
    .optional(),
});

@Injectable()
export class DemoDayTool {
  constructor(private logger: LogService, private prisma: PrismaService, private demoDaysService: DemoDaysService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Look up which teams presented (pitched) at a completed Demo Day and a short description of what they build. Only covers demo days that have already concluded — in-progress or upcoming demo day pitch/fundraising material is confidential and not available through this tool.',
      parameters: DemoDayToolParams,
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: z.infer<typeof DemoDayToolParams>) {
    this.logger.info(`Getting demo day teams for args: ${JSON.stringify(args)}`);

    const baseWhere: Prisma.DemoDayWhereInput = { status: DemoDayStatus.COMPLETED, isDeleted: false };

    const findBySearch = (search: string) =>
      this.prisma.demoDay.findFirst({
        where: {
          ...baseWhere,
          OR: [
            { title: { contains: search, mode: 'insensitive' } },
            { host: { contains: search, mode: 'insensitive' } },
          ],
        },
        orderBy: { endDate: 'desc' },
        select: { uid: true, title: true, host: true, endDate: true },
      });

    let demoDay = args.demoDaySearch
      ? await findBySearch(args.demoDaySearch)
      : await this.prisma.demoDay.findFirst({
          where: baseWhere,
          orderBy: { endDate: 'desc' },
          select: { uid: true, title: true, host: true, endDate: true },
        });

    if (!demoDay && args.demoDaySearch) {
      const fallbackSearch = longestWord(args.demoDaySearch);
      if (fallbackSearch) {
        demoDay = await findBySearch(fallbackSearch);
      }
    }

    if (!demoDay) {
      return args.demoDaySearch
        ? `No completed demo day matching "${args.demoDaySearch}" was found.`
        : 'No completed demo day found. Pitch/fundraising material for an in-progress or upcoming demo day is confidential and unavailable through search.';
    }

    // Same roster `GET /v1/demo-days/:id` already returns publicly (even to an
    // anonymous caller) for a COMPLETED demo day — never the confidential
    // pitch decks/videos/financials behind the fundraising-profiles endpoint,
    // which stays untouched by this tool. The second argument is a viewer
    // *email*, used only to compute a per-viewer `isFollowing` flag this
    // tool's text output never reads, so there's nothing to gain by resolving
    // and passing one — `null` skips that lookup entirely.
    const teams = await this.demoDaysService.getParticipatingTeamsForCompletedDemoDay(demoDay.uid, null);

    if (teams.length === 0) {
      return `No teams are recorded as having presented at "${demoDay.title}".`;
    }

    const header = `Demo Day: ${demoDay.title} (Host: ${demoDay.host}, ended ${demoDay.endDate.toLocaleDateString()})`;
    const rows = teams
      .map(
        (team) => `- ${team.name} [TeamLink](/teams/${team.uid}): ${team.shortDescription || 'No description provided'}`
      )
      .join('\n');

    return `${header}\n${rows}`;
  }
}

import { Injectable } from '@nestjs/common';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { JobOpeningsQueryService } from '../../job-openings/job-openings-query.service';
import { SENIORITY_DISPLAY } from '../../job-alerts/job-alerts.utils';
import { longestWord, resolveFocusAreaTitles } from './fuzzy-match.util';

// `JobOpening.seniority` is filtered by exact match, and is stored with an L-level suffix
// (e.g. "Senior (L4)") that a model has no way to guess from the question alone — without
// this, "senior" (a very natural thing to ask for) matches nothing. Accept either the
// canonical stored label or its short display form (job-alerts.utils.ts's own mapping) and
// expand to both when querying, since some historical rows only ever got the short form.
const SENIORITY_ALIASES = new Map<string, string[]>();
for (const [canonical, short] of Object.entries(SENIORITY_DISPLAY)) {
  const pair = [canonical, short];
  SENIORITY_ALIASES.set(canonical.toLowerCase(), pair);
  SENIORITY_ALIASES.set(short.toLowerCase(), pair);
}

/** Directory job page for a role, matching the frontend's `/jobs/openings/[uid]` route. */
export function jobOpeningPath(roleUid: string): string {
  return `/jobs/openings/${roleUid}`;
}

function resolveSeniority(input?: string): string[] | undefined {
  if (!input) return undefined;
  return SENIORITY_ALIASES.get(input.trim().toLowerCase()) ?? [input];
}

const JobOpeningsToolParams = z.object({
  search: z
    .string()
    .describe(
      'A single distinctive keyword to match against the role title or team name (e.g. a technology or company name, like "Rust" or "Bluesky") — this is an exact substring match, so a full phrase like "senior rust engineer roles" will not match a title such as "Senior Backend Engineer, Rust". Use the seniority/roleCategory/location/workMode/focus filters instead of folding those words into this term.'
    )
    .optional(),
  seniority: z
    .string()
    .describe(
      `Filter by seniority level: ${Object.values(SENIORITY_DISPLAY).join(
        ', '
      )} (either this short form or the full stored label, e.g. "Senior (L4)", works)`
    )
    .optional(),
  roleCategory: z.string().describe('Filter by role function/category, e.g. Engineering, Design').optional(),
  location: z.string().describe('Filter by location').optional(),
  workMode: z.string().describe('Filter by work mode, e.g. Remote, Hybrid, Onsite').optional(),
  focus: z.string().describe("Filter by the hiring team's focus area").optional(),
});

@Injectable()
export class JobOpeningsTool {
  constructor(
    private logger: LogService,
    private prisma: PrismaService,
    private jobOpeningsQueryService: JobOpeningsQueryService
  ) {}

  getTool(): CoreTool {
    return tool({
      description: 'Search open job listings across teams in the network, by role, seniority, location, or focus area',
      parameters: JobOpeningsToolParams,
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: z.infer<typeof JobOpeningsToolParams>) {
    this.logger.info(`Getting job openings for args: ${JSON.stringify(args)}`);

    const baseArgs = {
      seniority: resolveSeniority(args.seniority),
      roleCategory: args.roleCategory ? [args.roleCategory] : undefined,
      location: args.location ? [args.location] : undefined,
      workMode: args.workMode ? [args.workMode] : undefined,
      focus: args.focus ? await resolveFocusAreaTitles(this.prisma, args.focus) : undefined,
      limit: 10,
    };

    let { groups } = await this.jobOpeningsQueryService.listJobOpenings(
      JobsListQueryParams.parse({ ...baseArgs, q: args.search })
    );

    if (groups.length === 0 && args.search) {
      const fallbackSearch = longestWord(args.search);
      if (fallbackSearch) {
        ({ groups } = await this.jobOpeningsQueryService.listJobOpenings(
          JobsListQueryParams.parse({ ...baseArgs, q: fallbackSearch })
        ));
      }
    }

    if (groups.length === 0) {
      return 'No job openings found matching the search criteria.';
    }

    return groups
      .map((group) => {
        const roles = group.roles
          .map(
            // Citations stay on the directory job page. Apply is the external board, for source refs only.
            (role) => {
              const apply = role.applyUrl ? ` Apply: ${role.applyUrl}` : '';
              return `- ${role.roleTitle} (${role.seniority ?? 'Not specified'}, ${
                role.location.join(', ') || 'Not specified'
              }, ${role.workMode ?? 'Not specified'}) [JobLink](${jobOpeningPath(role.uid)})${apply}`;
            }
          )
          .join('\n');

        return `Team: ${group.team.name} [TeamLink](/teams/${group.team.uid})
                Focus Areas: ${group.team.focusAreas.join(', ') || 'Not provided'}
                Open Roles (${group.totalRoles}):
                ${roles}`;
      })
      .join('\n\n');
  }
}

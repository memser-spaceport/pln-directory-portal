import { Injectable } from '@nestjs/common';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';
import { JobsListQueryParams } from 'libs/contracts/src/schema/job-opening';
import { LogService } from '../../shared/log.service';
import { JobOpeningsQueryService } from '../../job-openings/job-openings-query.service';

const JobOpeningsToolParams = z.object({
  search: z.string().describe('Search term to look for in the role title or team name').optional(),
  seniority: z.string().describe('Filter by seniority level, e.g. Junior, Mid, Senior, Lead').optional(),
  roleCategory: z.string().describe('Filter by role function/category, e.g. Engineering, Design').optional(),
  location: z.string().describe('Filter by location').optional(),
  workMode: z.string().describe('Filter by work mode, e.g. Remote, Hybrid, Onsite').optional(),
  focus: z.string().describe("Filter by the hiring team's focus area").optional(),
});

@Injectable()
export class JobOpeningsTool {
  constructor(private logger: LogService, private jobOpeningsQueryService: JobOpeningsQueryService) {}

  getTool(): CoreTool {
    return tool({
      description: 'Search open job listings across teams in the network, by role, seniority, location, or focus area',
      parameters: JobOpeningsToolParams,
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: z.infer<typeof JobOpeningsToolParams>) {
    this.logger.info(`Getting job openings for args: ${JSON.stringify(args)}`);

    const query = JobsListQueryParams.parse({
      q: args.search,
      seniority: args.seniority ? [args.seniority] : undefined,
      roleCategory: args.roleCategory ? [args.roleCategory] : undefined,
      location: args.location ? [args.location] : undefined,
      workMode: args.workMode ? [args.workMode] : undefined,
      focus: args.focus ? [args.focus] : undefined,
      limit: 10,
    });

    const { groups } = await this.jobOpeningsQueryService.listJobOpenings(query);

    if (groups.length === 0) {
      return 'No job openings found matching the search criteria.';
    }

    return groups
      .map((group) => {
        const roles = group.roles
          .map((role) => {
            const applyLink = role.applyUrl ? ` [ApplyLink](${role.applyUrl})` : '';
            return `- ${role.roleTitle} (${role.seniority ?? 'Not specified'}, ${
              role.location.join(', ') || 'Not specified'
            }, ${role.workMode ?? 'Not specified'})${applyLink}`;
          })
          .join('\n');

        return `Team: ${group.team.name} [TeamLink](/teams/${group.team.uid})
                Focus Areas: ${group.team.focusAreas.join(', ') || 'Not provided'}
                Open Roles (${group.totalRoles}):
                ${roles}`;
      })
      .join('\n\n');
  }
}

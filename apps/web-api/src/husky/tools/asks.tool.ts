import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class AsksTool {
  constructor(private logger: LogService, private prisma: PrismaService) {}

  getTool(): CoreTool {
    return tool({
      description: 'Search for asks with detailed information including team, project, status, and closure details',
      parameters: z.object({
        search: z.string().describe('Search term to look for in ask title, description, or tags').optional(),
        teamName: z.string().describe('Filter by team name').optional(),
        projectName: z.string().describe('Filter by project name').optional(),
        status: z.enum(['OPEN', 'CLOSED']).describe('Filter by ask status').optional(),
        closedReason: z.string().describe('Filter by closure reason').optional(),
        closedBy: z.string().describe('Filter by name of member who closed the ask').optional(),
        tags: z
          .array(
            z.enum([
              'User Intro',
              'Hiring',
              'Marketing',
              'Investor Intro/Funding',
              'GTM/Biz Strategy',
              'Technical Support',
              'General',
              'Vendor Intro',
              'Events/Sponsorships',
              'Global Employment',
              'People Management',
              'Tokenomics',
              'Legal & Compliance',
              'Mentorship',
              'Feedback',
            ])
          )
          .describe('Filter by list of tags')
          .optional(),
        orderBy: z
          .enum(['date', 'title', 'status'])
          .describe('Sort asks by creation date, title, or status')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: {
    search?: string;
    teamName?: string;
    projectName?: string;
    status?: 'OPEN' | 'CLOSED';
    closedReason?: string;
    closedBy?: string;
    tags?: Array<
      | 'User Intro'
      | 'Hiring'
      | 'Marketing'
      | 'Investor Intro/Funding'
      | 'GTM/Biz Strategy'
      | 'Technical Support'
      | 'General'
      | 'Vendor Intro'
      | 'Events/Sponsorships'
      | 'Global Employment'
      | 'People Management'
      | 'Tokenomics'
      | 'Legal & Compliance'
      | 'Mentorship'
      | 'Feedback'
    >;
    orderBy?: 'date' | 'title' | 'status';
  }) {
    this.logger.info(`Getting asks for args: ${JSON.stringify(args)}`);

    const where: Prisma.AskWhereInput = {};

    if (args.search) {
      where.OR = [
        { title: { contains: args.search, mode: 'insensitive' } },
        { description: { contains: args.search, mode: 'insensitive' } },
        { tags: { hasSome: [args.search] } },
      ];
    }

    if (args.teamName) {
      where.team = {
        name: { contains: args.teamName, mode: 'insensitive' },
      };
    }

    if (args.projectName) {
      where.project = {
        name: { contains: args.projectName, mode: 'insensitive' },
      };
    }

    if (args.status) {
      where.status = args.status;
    }

    if (args.closedReason) {
      where.closedReason = { contains: args.closedReason, mode: 'insensitive' };
    }

    if (args.closedBy) {
      where.closedBy = {
        name: { contains: args.closedBy, mode: 'insensitive' },
      };
    }

    if (args.tags && args.tags.length > 0) {
      where.tags = {
        hasSome: args.tags,
      };
    }

    const asks = await this.prisma.ask.findMany({
      where,
      include: {
        team: true,
        project: true,
        closedBy: true,
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'date' && { createdAt: 'desc' }),
            ...(args.orderBy === 'title' && { title: 'asc' }),
            ...(args.orderBy === 'status' && { status: 'asc' }),
          }
        : undefined,
      take: 10,
    });

    return asks
      .map((ask) => {
        const teamInfo = ask.team ? `Team: ${ask.team.name}\n[TeamLink](/teams/${ask.team.uid})` : 'No team';
        const projectInfo = ask.project
          ? `Project: ${ask.project.name}\n[ProjectLink](/projects/${ask.project.uid})`
          : 'No project';
        const closedInfo =
          ask.status === 'CLOSED'
            ? `Closed At: ${ask.closedAt}
             Closed By: ${ask.closedBy?.name || 'Unknown'}
             Closed Reason: ${ask.closedReason || 'Not provided'}
             Closed Comment: ${ask.closedComment || 'Not provided'}`
            : 'Status: Open';

        return `Ask ID: ${ask.uid}
                Title: ${ask.title}
                Description: ${ask.description}
                Tags: ${ask.tags.join(', ')}
                ${teamInfo}
                ${projectInfo}
                Created At: ${ask.createdAt}
                Updated At: ${ask.updatedAt}
                ${closedInfo}`;
      })
      .join('\n\n');
  }
}

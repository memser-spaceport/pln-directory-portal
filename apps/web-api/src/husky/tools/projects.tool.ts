import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class ProjectsTool {
  constructor(private logger: LogService, private prisma: PrismaService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Search for projects with detailed information including team, members, focus areas, contributions, related questions, and asks',
      parameters: z.object({
        search: z
          .string()
          .describe('Search term to look for in project name, description, or other details')
          .optional(),
        creatorName: z.string().describe('Filter by project creator name').optional(),
        teamName: z.string().describe('Filter by maintaining or contributing team name').optional(),
        askTitle: z.string().describe('Filter by related ask title').optional(),
        isFeatured: z.boolean().describe('Filter by featured status').optional(),
        orderBy: z
          .enum(['date', 'score', 'contributions'])
          .describe('Sort projects by creation date, score, or number of contributions')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: {
    search?: string;
    creatorName?: string;
    teamName?: string;
    askTitle?: string;
    isFeatured?: boolean;
    orderBy?: 'date' | 'score' | 'contributions';
  }) {
    this.logger.info(`Getting projects for args: ${JSON.stringify(args)}`);

    const where: Prisma.ProjectWhereInput = {};

    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: 'insensitive' } },
        { tagline: { contains: args.search, mode: 'insensitive' } },
        { description: { contains: args.search, mode: 'insensitive' } },
        { readMe: { contains: args.search, mode: 'insensitive' } },
        { tags: { hasSome: [args.search] } },
      ];
    }

    if (args.creatorName) {
      where.creator = {
        name: { contains: args.creatorName, mode: 'insensitive' },
      };
    }

    if (args.teamName) {
      where.OR = [
        { maintainingTeam: { name: { contains: args.teamName, mode: 'insensitive' } } },
        { contributingTeams: { some: { name: { contains: args.teamName, mode: 'insensitive' } } } },
      ];
    }

    if (args.askTitle) {
      where.asks = {
        some: { title: { contains: args.askTitle, mode: 'insensitive' } },
      };
    }

    if (args.isFeatured !== undefined) where.isFeatured = args.isFeatured;

    const projects = await this.prisma.project.findMany({
      where,
      include: {
        logo: true,
        creator: true,
        maintainingTeam: true,
        contributingTeams: true,
        projectFocusAreas: {
          include: {
            focusArea: true,
            ancestorArea: true,
          },
        },
        contributions: {
          include: {
            member: true,
          },
        },
        relatedQuestions: true,
        asks: true,
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'date' && { createdAt: 'desc' }),
            ...(args.orderBy === 'score' && { score: 'desc' }),
            ...(args.orderBy === 'contributions' && { contributions: { _count: 'desc' } }),
          }
        : undefined,
      take: 10,
    });

    return projects
      .map((project) => {
        const teamInfo = [
          project.maintainingTeam ? `${project.maintainingTeam.name} (Maintaining)` : null,
          ...project.contributingTeams.map((team) => `${team.name} (Contributing)`),
        ]
          .filter(Boolean)
          .join(', ');

        const focusAreas = project.projectFocusAreas
          .map((area) => `${area.focusArea.title} (Ancestor: ${area.ancestorArea.title})`)
          .join(', ');

        const contributions = project.contributions
          .map((contribution) => {
            const memberName = contribution.member?.name || 'Unknown';
            const role = contribution.role || 'No role specified';
            const dates = contribution.startDate
              ? `(${new Date(contribution.startDate).toLocaleDateString()} - ${
                  contribution.endDate ? new Date(contribution.endDate).toLocaleDateString() : 'Present'
                })`
              : '';
            return `${memberName} - ${role} ${dates}`;
          })
          .join('\n');

        const relatedQuestions = project.relatedQuestions
          .map((question) => `${question.title || 'Untitled'}: ${question.content}`)
          .join('\n');

        const asks = project.asks.map((ask) => ask.title).join(', ');

        return `Project ID: ${project.uid}
                Link: /projects/${project.uid}
                Name: ${project.name}
                Tagline: ${project.tagline}
                Description: ${project.description}
                Creator: ${project.creator?.name || 'Unknown'}
                Contact Email: ${project.contactEmail || 'Not provided'}
                Looking for Funding: ${project.lookingForFunding ? 'Yes' : 'No'}
                Featured: ${project.isFeatured ? 'Yes' : 'No'}
                Score: ${project.score || 'Not available'}
                Teams: ${teamInfo || 'None'}
                Focus Areas: ${focusAreas || 'None'}
                Tags: ${project.tags.join(', ') || 'None'}
                Project Links: ${JSON.stringify(project.projectLinks) || 'None'}
                KPIs: ${JSON.stringify(project.kpis) || 'None'}
                ReadMe: ${project.readMe || 'Not provided'}
                Contributions:
                ${contributions || 'None'}
                Related Questions:
                ${relatedQuestions || 'None'}
                Asks: ${asks || 'None'}`;
      })
      .join('\n\n');
  }
}

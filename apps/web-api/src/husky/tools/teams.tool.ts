import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class TeamsTool {
  constructor(private logger: LogService, private prisma: PrismaService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Search for teams with detailed information including members, projects, technologies, asks, and events',
      parameters: z.object({
        search: z
          .string()
          .describe('Search term to look for in team name, description, members, projects, or asks')
          .optional(),
        isFeatured: z.boolean().describe('Filter by featured status').optional(),
        createdDate: z.string().describe('Filter teams created on or after this date (format: YYYY-MM-DD)').optional(),
        orderBy: z
          .enum(['date', 'members', 'projects'])
          .describe('Sort teams by creation date, member count, or project count')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: {
    search?: string;
    isFeatured?: boolean;
    createdDate?: string;
    orderBy?: 'date' | 'members' | 'projects';
  }) {
    this.logger.info(`Getting teams for args: ${JSON.stringify(args)}`);

    const where: Prisma.TeamWhereInput = {};

    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: 'insensitive' } },
        { shortDescription: { contains: args.search, mode: 'insensitive' } },
        { longDescription: { contains: args.search, mode: 'insensitive' } },
        { teamMemberRoles: { some: { member: { name: { contains: args.search, mode: 'insensitive' } } } } },
        { maintainingProjects: { some: { name: { contains: args.search, mode: 'insensitive' } } } },
        { contributingProjects: { some: { name: { contains: args.search, mode: 'insensitive' } } } },
        { asks: { some: { title: { contains: args.search, mode: 'insensitive' } } } },
      ];
    }

    if (args.isFeatured !== undefined) where.isFeatured = args.isFeatured;
    if (args.createdDate) {
      where.createdAt = {
        gte: new Date(args.createdDate),
      };
    }

    const teams = await this.prisma.team.findMany({
      where,
      include: {
        logo: true,
        teamMemberRoles: {
          include: {
            member: true,
          },
        },
        industryTags: true,
        technologies: true,
        maintainingProjects: true,
        contributingProjects: true,
        asks: true,
        eventGuests: {
          include: {
            event: true,
          },
        },
        fundingStage: true,
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'date' && { createdAt: 'desc' }),
            ...(args.orderBy === 'members' && { teamMemberRoles: { _count: 'desc' } }),
            ...(args.orderBy === 'projects' && { maintainingProjects: { _count: 'desc' } }),
          }
        : undefined,
      take: 10,
    });

    return teams
      .map((team) => {
        const socialLinks = [
          team.twitterHandler ? `Twitter: ${team.twitterHandler}` : null,
          team.linkedinHandler ? `LinkedIn: ${team.linkedinHandler}` : null,
          team.telegramHandler ? `Telegram: ${team.telegramHandler}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const members = team.teamMemberRoles.map((role) => `${role.member.name} (${role.role})`).join(', ');

        const projects = [
          ...team.maintainingProjects.map((p) => `${p.name} (Maintaining)`),
          ...team.contributingProjects.map((p) => `${p.name} (Contributing)`),
        ].join(', ');

        const asks = team.asks.map((ask) => ask.title).join(', ');

        const events = team.eventGuests
          .map((guest) => {
            const roles: string[] = [];
            if (guest.isHost) roles.push('Host');
            if (guest.isSpeaker) roles.push('Speaker');
            if (guest.isSponsor) roles.push('Sponsor');
            return `${guest.event.name} (${roles.join(', ')})`;
          })
          .join(', ');

        return `Team ID: ${team.uid}
                Link: /teams/${team.uid}
                Name: ${team.name}
                Short Description: ${team.shortDescription || 'Not provided'}
                Long Description: ${team.longDescription || 'Not provided'}
                Website: ${team.website || 'Not provided'}
                Blog: ${team.blog || 'Not provided'}
                Office Hours: ${team.officeHours || 'Not provided'}
                Contact Method: ${team.contactMethod || 'Not provided'}
                PLN Friend: ${team.plnFriend ? 'Yes' : 'No'}
                Featured: ${team.isFeatured ? 'Yes' : 'No'}
                Funding Stage: ${team.fundingStage?.title || 'Not specified'}
                Social Links:
                ${socialLinks}
                Industry Tags: ${team.industryTags.map((tag) => tag.title).join(', ')}
                Technologies: ${team.technologies.map((tech) => tech.title).join(', ')}
                Members: ${members || 'None'}
                Projects: ${projects || 'None'}
                Asks: ${asks || 'None'}
                Events: ${events || 'None'}
                More Details: ${team.moreDetails || 'Not provided'}`;
      })
      .join('\n\n');
  }
}

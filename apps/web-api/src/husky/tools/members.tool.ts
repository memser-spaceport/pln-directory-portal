import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class MembersTool {
  constructor(private logger: LogService, private prisma: PrismaService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Search for members with detailed information including teams, projects, asks, experiences, and interactions',
      parameters: z.object({
        search: z.string().describe('Search term to look for in member name, email, bio, or other details').optional(),
        isVerified: z.boolean().describe('Filter by verified status').optional(),
        isFeatured: z.boolean().describe('Filter by featured status').optional(),
        openToWork: z.boolean().describe('Filter by open to work status').optional(),
        plnFriend: z.boolean().describe('Filter by PLN friend status').optional(),
        orderBy: z
          .enum(['name', 'date', 'plnStartDate'])
          .describe('Sort members by name, creation date, or PLN start date')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: {
    search?: string;
    isVerified?: boolean;
    isFeatured?: boolean;
    openToWork?: boolean;
    plnFriend?: boolean;
    orderBy?: 'name' | 'date' | 'plnStartDate';
  }) {
    this.logger.info(`Getting members for args: ${JSON.stringify(args)}`);

    const where: Prisma.MemberWhereInput = {};

    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: 'insensitive' } },
        { email: { contains: args.search, mode: 'insensitive' } },
        { bio: { contains: args.search, mode: 'insensitive' } },
        { githubHandler: { contains: args.search, mode: 'insensitive' } },
        { discordHandler: { contains: args.search, mode: 'insensitive' } },
        { twitterHandler: { contains: args.search, mode: 'insensitive' } },
        { linkedinHandler: { contains: args.search, mode: 'insensitive' } },
        { telegramHandler: { contains: args.search, mode: 'insensitive' } },
      ];
    }

    if (args.isVerified !== undefined) where.isVerified = args.isVerified;
    if (args.isFeatured !== undefined) where.isFeatured = args.isFeatured;
    if (args.openToWork !== undefined) where.openToWork = args.openToWork;
    if (args.plnFriend !== undefined) where.plnFriend = args.plnFriend;

    const members = await this.prisma.member.findMany({
      where,
      include: {
        image: true,
        location: true,
        skills: true,
        teamMemberRoles: {
          include: {
            team: true,
          },
        },
        createdProjects: true,
        projectContributions: {
          include: {
            project: true,
          },
        },
        closedAsks: true,
        interactions: {
          include: {
            targetMember: true,
          },
        },
        targetInteractions: {
          include: {
            sourceMember: true,
          },
        },
        experiences: true,
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'name' && { name: 'asc' }),
            ...(args.orderBy === 'date' && { createdAt: 'desc' }),
            ...(args.orderBy === 'plnStartDate' && { plnStartDate: 'desc' }),
          }
        : undefined,
      take: 10,
    });

    return members
      .map((member) => {
        const socialLinks = [
          member.githubHandler ? `GitHub: ${member.githubHandler}` : null,
          member.discordHandler ? `Discord: ${member.discordHandler}` : null,
          member.twitterHandler ? `Twitter: ${member.twitterHandler}` : null,
          member.linkedinHandler ? `LinkedIn: ${member.linkedinHandler}` : null,
          member.telegramHandler ? `Telegram: ${member.telegramHandler}` : null,
        ]
          .filter(Boolean)
          .join('\n');

        const teams = member.teamMemberRoles
          .map((role) => `${role.team.name} (${role.role}) [TeamLink](/teams/${role.team.uid})`)
          .join(', ');

        const projects = [
          ...member.createdProjects.map((p) => `${p.name} (Creator) [ProjectLink](/projects/${p.uid})`),
          ...member.projectContributions.map((c) => (c.project ? `${c.project.name} (${c.role})` : '')).filter(Boolean),
        ].join(', ');

        const asks = member.closedAsks.map((ask) => ask.title).join(', ');

        const interactions = [
          ...member.interactions
            .map((i) => (i.targetMember ? `To: ${i.targetMember.name} (${i.type})` : ''))
            .filter(Boolean),
          ...member.targetInteractions
            .map((i) => (i.sourceMember ? `From: ${i.sourceMember.name} (${i.type})` : ''))
            .filter(Boolean),
        ].join(', ');

        const experiences = member.experiences
          .map(
            (exp) =>
              `${exp.title} at ${exp.company}${exp.location ? ` in ${exp.location}` : ''} (${exp.startDate} - ${
                exp.endDate || 'Present'
              })${exp.description ? ` - ${exp.description}` : ''}`
          )
          .join('\n');

        return `Member ID: ${member.uid}
                [MemberLink](/members/${member.uid})
                Name: ${member.name}
                Email: ${member.email || 'Not provided'}
                Bio: ${member.bio || 'Not provided'}
                Location: ${
                  member.location
                    ? `${member.location.city || ''}${member.location.city && member.location.country ? ', ' : ''}${
                        member.location.country || ''
                      }${(member.location.city || member.location.country) && member.location.region ? ', ' : ''}${
                        member.location.region || ''
                      }`
                    : 'Not provided'
                }
                PLN Friend: ${member.plnFriend ? 'Yes' : 'No'}
                Verified: ${member.isVerified ? 'Yes' : 'No'}
                Featured: ${member.isFeatured ? 'Yes' : 'No'}
                Open to Work: ${member.openToWork ? 'Yes' : 'No'}
                Skills: ${member.skills.map((s) => s.title).join(', ')}
                Social Links:
                ${socialLinks}
                Teams: ${teams || 'None'}
                Projects: ${projects || 'None'}
                Asks: ${asks || 'None'}
                Interactions: ${interactions || 'None'}
                Experiences:
                ${experiences || 'None'}`;
      })
      .join('\n\n');
  }
}

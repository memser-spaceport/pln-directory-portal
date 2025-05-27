import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class FocusAreasTool {
  constructor(private logger: LogService, private prisma: PrismaService) {}

  getTool(): CoreTool {
    return tool({
      description:
        'Search for focus areas with detailed information including parent/child relationships, team areas, and project areas',
      parameters: z.object({
        search: z
          .string()
          .describe('Search term to look for in focus area title, description, parent title, or child title')
          .optional(),
        orderBy: z
          .enum(['title', 'date', 'teams', 'projects'])
          .describe('Sort focus areas by title, creation date, number of teams, or number of projects')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: { search?: string; orderBy?: 'title' | 'date' | 'teams' | 'projects' }) {
    this.logger.info(`Getting focus areas for args: ${JSON.stringify(args)}`);

    const where: Prisma.FocusAreaWhereInput = {};

    if (args.search) {
      where.OR = [
        { title: { contains: args.search, mode: 'insensitive' } },
        { description: { contains: args.search, mode: 'insensitive' } },
        { parent: { title: { contains: args.search, mode: 'insensitive' } } },
        { children: { some: { title: { contains: args.search, mode: 'insensitive' } } } },
      ];
    }

    const focusAreas = await this.prisma.focusArea.findMany({
      where,
      include: {
        parent: true,
        children: true,
        teamFocusAreas: {
          include: {
            team: true,
          },
        },
        teamAncestorFocusAreas: {
          include: {
            team: true,
          },
        },
        projectFocusAreas: {
          include: {
            project: true,
          },
        },
        projectAncestorFocusAreas: {
          include: {
            project: true,
          },
        },
        focusAreas: {
          include: {
            subFocusArea: true,
          },
        },
        subFocusAreas: {
          include: {
            focusArea: true,
          },
        },
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'title' && { title: 'asc' }),
            ...(args.orderBy === 'date' && { createdAt: 'desc' }),
            ...(args.orderBy === 'teams' && { teamFocusAreas: { _count: 'desc' } }),
            ...(args.orderBy === 'projects' && { projectFocusAreas: { _count: 'desc' } }),
          }
        : undefined,
      take: 10,
    });

    return focusAreas
      .map((area) => {
        const parentInfo = area.parent ? `Parent: ${area.parent.title}` : 'No parent';
        const childrenInfo = area.children.length
          ? `Children: ${area.children.map((child) => child.title).join(', ')}`
          : 'No children';

        const teamAreas = [
          ...area.teamFocusAreas.map((tfa) => `${tfa.team.name} (Direct) TeamLink: /teams/${tfa.team.uid}`),
          ...area.teamAncestorFocusAreas.map((tfa) => `${tfa.team.name} (Ancestor) TeamLink: /teams/${tfa.team.uid}`),
        ].join(', ');

        const projectAreas = [
          ...area.projectFocusAreas.map(
            (pfa) => `${pfa.project.name} (Direct) ProjectLink: /projects/${pfa.project.uid}`
          ),
          ...area.projectAncestorFocusAreas.map(
            (pfa) => `${pfa.project.name} (Ancestor) ProjectLink: /projects/${pfa.project.uid}`
          ),
        ].join(', ');

        const hierarchyInfo = [
          ...area.focusAreas.map((h) => `Direct Sub-Area: ${h.subFocusArea.title}`),
          ...area.subFocusAreas.map((h) => `Direct Parent Area: ${h.focusArea.title}`),
        ].join('\n');

        return `Focus Area ID: ${area.uid}
                Title: ${area.title}
                Description: ${area.description || 'Not provided'}
                Created At: ${area.createdAt}
                Updated At: ${area.updatedAt}
                ${parentInfo}
                ${childrenInfo}
                Teams: ${teamAreas || 'None'}
                Projects: ${projectAreas || 'None'}
                Hierarchy:
                ${hierarchyInfo || 'None'}`;
      })
      .join('\n\n');
  }
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { LogService } from '../../shared/log.service';
import { PrismaService } from '../../shared/prisma.service';
import { tool, CoreTool } from 'ai';
import { z } from 'zod';

@Injectable()
export class IrlEventsTool {
  private locationsList: string[] = [];

  constructor(private logger: LogService, private prisma: PrismaService) {}

  async initialize() {
    const locations = await this.prisma.pLEventLocation.findMany({
      select: {
        location: true,
      },
    });
    this.locationsList = locations.map((location) => location.location);
  }

  getTool(): CoreTool {
    return tool({
      description:
        'Look up the IRL events for the provided parameters. Returns list of IRL events with name, type, description, website, location, dates, resources, and guests',
      parameters: z.object({
        location: z
          .string()
          .describe(`The location to search for. Possible values: ${this.locationsList.join(', ')}`)
          .optional(),
        fromDate: z.string().describe('The optional start date to search for, format YYYY-MM-DD').optional(),
        toDate: z.string().describe('The optional end date to search for, format YYYY-MM-DD').optional(),
        search: z
          .string()
          .describe('Optional search term to look for in event name, description, location, or guest names')
          .optional(),
        guestName: z.string().describe('Optional guest name to search for in event guests').optional(),
        orderBy: z
          .enum(['date', 'name', 'priority'])
          .describe('Sort events by start date, name, or priority')
          .optional(),
      }),
      execute: (args) => this.execute(args),
    });
  }

  private async execute(args: {
    location?: string;
    fromDate?: string;
    toDate?: string;
    search?: string;
    guestName?: string;
    orderBy?: 'date' | 'name' | 'priority';
  }) {
    this.logger.info(`Getting IRL events for args: ${JSON.stringify(args)}`);

    const where: Prisma.PLEventWhereInput = {};

    if (args.fromDate) {
      where.startDate = {
        gte: new Date(args.fromDate),
      };
    }

    if (args.toDate) {
      where.endDate = {
        lte: new Date(args.toDate),
      };
    }

    if (args.location) {
      where.location = {
        location: args.location,
      };
    }

    if (args.search) {
      where.OR = [
        { name: { contains: args.search, mode: 'insensitive' } },
        { description: { contains: args.search, mode: 'insensitive' } },
        { location: { location: { contains: args.search, mode: 'insensitive' } } },
      ];
    }

    if (args.guestName) {
      where.eventGuests = {
        some: {
          OR: [
            { member: { name: { contains: args.guestName, mode: 'insensitive' } } },
            { team: { name: { contains: args.guestName, mode: 'insensitive' } } },
          ],
        },
      };
    }

    const events = await this.prisma.pLEvent.findMany({
      where,
      include: {
        location: true,
        eventGuests: {
          include: {
            member: true,
            team: true,
          },
        },
      },
      orderBy: args.orderBy
        ? {
            ...(args.orderBy === 'date' && { startDate: 'asc' }),
            ...(args.orderBy === 'name' && { name: 'asc' }),
            ...(args.orderBy === 'priority' && { priority: 'desc' }),
          }
        : undefined,
      take: 10,
    });

    return events
      .map((event) => {
        const location = event.location ? `Location: ${event.location.location} (${event.location.timezone})` : '';
        const dateRange =
          event.startDate && event.endDate
            ? `Dates: ${new Date(event.startDate).toLocaleDateString()} to ${new Date(
                event.endDate
              ).toLocaleDateString()}`
            : '';
        const resources = event.resources?.length
          ? `Resources: ${event.resources
              .map((r) => {
                if (r && typeof r === 'object' && !Array.isArray(r)) {
                  const resource = r as { name?: string; url?: string };
                  return `${resource.name || ''} (${resource.url || ''})`;
                }
                return '';
              })
              .filter(Boolean)
              .join(', ')}`
          : '';
        const locationResources = event.location?.resources?.length
          ? `Location Resources: ${event.location.resources
              .map((r) => {
                if (r && typeof r === 'object' && !Array.isArray(r)) {
                  const resource = r as { description?: string; url?: string };
                  return `${resource.description || ''} (${resource.url || ''})`;
                }
                return '';
              })
              .filter(Boolean)
              .join(', ')}`
          : '';
        const guests = event.eventGuests?.length
          ? `Guests: ${event.eventGuests
              .map((guest) => {
                const guestName = guest.member?.name || guest.team?.name || '';
                const roles: string[] = [];
                if (guest.isHost) roles.push('Host');
                if (guest.isSpeaker) roles.push('Speaker');
                if (guest.isSponsor) roles.push('Sponsor');
                return `${guestName}${roles.length ? ` (${roles.join(', ')})` : ''}`;
              })
              .filter(Boolean)
              .join(', ')}`
          : '';

        return `Event ID: ${event.uid}
                Name: ${event.name}
                Type: ${event.type}
                Description: ${event.description}
                Website: ${event.websiteURL}
                ${location}
                ${dateRange}
                ${resources}
                ${locationResources}
                ${guests}`;
      })
      .join('\n\n');
  }
}

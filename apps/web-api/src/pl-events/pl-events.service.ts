import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma, PLEvent, Member } from '@prisma/client';
import { PLEventGuestsService } from './pl-event-guests.service';

@Injectable()
export class PLEventsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private eventGuestsService: PLEventGuestsService
  ) {}

  /**
   * This method retrieves multiple events based on the provided query options.
   * @param queryOptions Options for querying events, including filters and sorting
   * @returns An array of event objects with additional details such as logo, banner, event guests, and location.
   */
  async getPLEvents(queryOptions: Prisma.PLEventFindManyArgs): Promise<PLEvent[]> {
    return await this.prisma.pLEvent.findMany({
      ...queryOptions,
      include: {
        logo: true,
        banner: true,
        eventGuests: {
          select: {
            eventUid: true
          }
        },
        location: true
      }
    });
  };

  /**
   * This method retrieves a specific event by its slug URL, with different details based on whether the user is logged in. 
   * And also provides filtered result based on the provided query param.
   * @param slug The slug URL of the event
   * @param query where clause query for applying filter.
   * @param isUserLoggedIn A boolean indicating whether the user is logged in
   * @returns The event object with its logo, banner, and event guests (with sensitive data restricted based on login status).
   *   - Filters private resources and applies member preferences on event guests' details like telegramId and office hours.
   *   - Throws NotFoundException if the event is not found with the given slug.
   */
  async getPLEventBySlug(slug, query, isUserLoggedIn): Promise<PLEvent> {
    try {
      const plEvent = await this.prisma.pLEvent.findUniqueOrThrow({
        where: { slugURL: slug },
        include: {
          logo: { select: { url: true } },
          banner: { select: { url: true } },
          eventGuests: {
            where: query.where,
            select: {
              uid: true,
              reason: true,
              memberUid: true,
              teamUid: true,
              topics: true,
              additionalInfo: true,
              isHost: true,
              isSpeaker: true,
              createdAt: true,
              telegramId: isUserLoggedIn ? true : false,
              officeHours: isUserLoggedIn ? true : false,
              event: {
                include: {
                  logo: { select: { url: true } }
                }
              },
              member: {
                select: {
                  image: { select: { url: true } },
                  name: true,
                  preferences: true,
                  telegramHandler: isUserLoggedIn ? true : false,
                  officeHours: isUserLoggedIn ? true : false,
                  teamMemberRoles: {
                    select: {
                      team: {
                        select: {
                          uid: true,
                          name: true,
                          logo: { select: { url: true } }
                        }
                      }
                    }
                  },
                  projectContributions: {
                    select: {
                      project: {
                        select: {
                          name: true,
                          isDeleted: true
                        }
                      }
                    }
                  },
                  createdProjects: {
                    select: {
                      name: true,
                      isDeleted: true
                    }
                  }
                }
              },
              team: {
                select: {
                  uid: true,
                  name: true,
                  logo: { select: { url: true } }
                }
              }
            },
            take: query.take,
            skip: query.skip
          }
        }
      });
      if (plEvent) {
        this.filterPrivateResources(plEvent, query.isUserLoggedIn);
        plEvent.eventGuests = this.eventGuestsService.restrictTelegramBasedOnMemberPreference(plEvent?.eventGuests, query.isUserLoggedIn);
        // plEvent.eventGuests = this.eventGuestsService.restrictOfficeHours(plEvent?.eventGuests, isUserLoggedIn);
      }
      return plEvent;
    } catch (err) {
      return this.handleErrors(err, query.slug);
    }
  };

  /**
   * This method retrieves events associated with a specific member.
   * @param member The member object, including the member UID
   * @param locationUid The unique identifier of the event location
   * @returns An array of event objects where the member is a guest
   *   - Throws errors if there are issues with the query, including validation or database errors.
   */
  async getPLEventsByMemberAndLocation(member: Member, locationUid: string): Promise<PLEvent[]> {
    try {
      return this.prisma.pLEvent.findMany({
        where: {
          locationUid,
          eventGuests: {
            some: {
              memberUid: member?.uid
            }
          }
        }
      })
    } catch (err) {
      return this.handleErrors(err);
    }
  }

  /**
   * This method filters out private resources from an event's resources if the user is not logged in.
   * @param plEvent The event object containing the resources array
   * @param isUserLoggedIn A boolean indicating whether the user is logged in
   * @returns The event object with private resources removed for non-logged-in users
   */
  filterPrivateResources(plEvent: PLEvent, isUserLoggedIn: boolean) {
    if (plEvent?.resources && plEvent?.resources.length && !isUserLoggedIn) {
      plEvent.resources = plEvent?.resources.filter((resource: any) => {
        return !resource.isPrivate
      });
    }
    return plEvent;
  };

  /**
   * This method handles errors that occur during database operations, specifically Prisma-related errors.
   * @param error The error object caught during operations
   * @param message Optional additional message to include in the exception
   *   - Throws specific exceptions like ConflictException for unique constraint violations, BadRequestException for foreign key or validation errors, and NotFoundException if an event is not found.
   */
  private handleErrors(error, message?): any {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on Event Guest:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Event Guest', error.message);
        case 'P2025':
          throw new NotFoundException('Event is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {

      throw new BadRequestException('Database field validation error on Event Guest', error.message);
    }
    throw error;
  };


  /** 
   * This method construct the dynamic query to search the given text in either
   * by member name , project name or by team name from query params
   * This method builts a query to enable search by team name or member name.
   * @param query name of the team or member which is to be fetched
   * @returns Constructed query based on given text(name) input.
   */
  buildSearchFilter(query) {
    const { searchBy } = query;
    if (searchBy) {
      return {
        OR: [
          {
            member: {
              name: {
                contains : searchBy,
                mode: 'insensitive',
              },
            }
          },
          {
            member: {
              projectContributions: {
                some: {
                  project: {
                    name: {
                      contains: searchBy,
                      mode: 'insensitive',
                    },
                  },
                },
              },
            }
          },
          {
            team: {
              name: {
                contains: searchBy,
                mode: 'insensitive'
              }
            }
          },
        ]
      }
    }
    return {};
  };

}

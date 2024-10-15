import moment from 'moment-timezone';
import { Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { 
  PLEventLocationWithEvents,
  FormattedLocationWithEvents,
  PLEvent 
} from './pl-event-locations.types';

@Injectable()
export class PLEventLocationsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService
  ) {}

  /**
   * This method retrieves the event location by its UID, including all associated events.
   * @param uid The unique identifier for the event location
   * @returns The event location object with associated events
   *   - The events include details such as name, type, description, startDate, endDate, and additional info.
   *   - Throws NotFoundException if the location with the given UID is not found.
   */
  async getPLEventLocationByUid(uid: string): Promise<FormattedLocationWithEvents> {
    try {
      const location: PLEventLocationWithEvents = await this.prisma.pLEventLocation.findUniqueOrThrow({
        where: { uid },
        include: {
          events: {
            select: {
              slugURL: true,
              uid: true,
              name: true,
              type: true,
              description: true,
              startDate: true,
              endDate: true,
              logo: true,
              banner: true,
              resources: true,
              additionalInfo: true
            }
          }
        }
      });
      return this.formatLocation(location);
    } catch (error) {
      return this.handleErrors(error, uid);
    }
  };
  
  /**
   * This method retrieves all upcoming events for a specified location.
   * @param locationUid The unique identifier of the event location
   * @returns An array of upcoming events for the given location
   *   - The events include details like name, description, and date, formatted in the location's timezone.
   */
  async getUpcomingEventsByLocation(locationUid: string): Promise<PLEvent[]> {  
    const result = await this.getPLEventLocationByUid(locationUid);
    return result?.upcomingEvents;
  }

  /**
   * This method retrieves all past events for a specified location.
   * @param locationUid The unique identifier of the event location
   * @returns An array of past events for the given location
   *   - The events include details like name, description, and date, formatted in the location's timezone.
   */
  async getPastEventsByLocation(locationUid: string): Promise<PLEvent[]> {
    const result = await this.getPLEventLocationByUid(locationUid);
    return result?.pastEvents;
  }

  /**
   * This method retrieves a list of event locations based on the given query options.
   * @param queryOptions Options for querying the event locations (e.g., filtering and sorting)
   * @returns An array of event locations, each with associated events
   *   - Each event location includes event details such as name, startDate, and resources.
   */
  async getPLEventLocations(queryOptions: Prisma.PLEventLocationFindManyArgs): Promise<FormattedLocationWithEvents[]> {
    try {
      const locations = await this.prisma.pLEventLocation.findMany({
        ...queryOptions,
        include: {
          events: {
            select: {
              slugURL: true,
              uid: true,
              name: true,
              type: true,
              description: true,
              startDate: true,
              endDate: true,
              logo: true,
              banner: true,
              resources: true,
              additionalInfo: true
            }
          }
        }
      });
      return locations.map((location) => {
        return this.formatLocation(location);
      });  
    } catch (error) {
      return this.handleErrors(error);
    }
  };

  /**
   * This method formats the event location object and segregates its events into past and upcoming events.
   * @param location The event location object retrieved from the database
   * @returns The formatted location object with pastEvents and upcomingEvents fields
   *   - Past and upcoming events are based on the current date and the location's timezone.
   */
  private formatLocation(location: PLEventLocationWithEvents): FormattedLocationWithEvents {
    return {
      ...location,
      ...this.segregateEventsByTime(location.events, location.timezone)
    }
  };

  /**
   * This method separates the events of a location into past and upcoming based on the timezone.
   * @param events An array of event objects associated with the location
   * @param timezone The timezone of the location
   * @returns An object containing two arrays: pastEvents and upcomingEvents
   *   - Events are classified as past or upcoming depending on whether their start date is before or after the current time.
   */  
  private segregateEventsByTime(events: PLEvent[], timezone: string): { pastEvents: PLEvent[], upcomingEvents: PLEvent[] } {
    const currentDateTimeInZone = moment().tz(timezone);
    const pastEvents:any = [];
    const upcomingEvents:any = [];
    events.forEach((event) => {
      const eventStartDateInZone = moment.utc(event.startDate).tz(timezone);
      const eventEndDateInZone = moment.utc(event.endDate).tz(timezone);
      if (eventEndDateInZone.isBefore(currentDateTimeInZone)) {
        pastEvents.push({
          ...event,
          startDate: eventStartDateInZone.format(),
          endDate: eventEndDateInZone.format()
        });
      } else {
        upcomingEvents.push({
          ...event,
          startDate: eventStartDateInZone.format(),
          endDate: eventEndDateInZone.format()
        });
      }
    });
    return { pastEvents, upcomingEvents };
  };

  /**
   * This method handles errors and throws custom exceptions based on Prisma error codes.
   * @param error The error object caught during database operations
   * @param message Optional additional message to include in the exception
   *   - Throws NotFoundException if the error is related to a missing record (Prisma error code 'P2025').
   *   - Logs the error using the logger service before throwing exceptions.
   */
  private handleErrors(error, message?: string): any {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2025':
          throw new NotFoundException('Pl Event location is not found with uid:' + message);
        default:
          throw error;
      }
    }
    throw error;
  };
}

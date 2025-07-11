import moment from 'moment-timezone';
import { Prisma, SubscriptionEntityType } from '@prisma/client';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MemberSubscriptionService } from '../member-subscriptions/member-subscriptions.service';
import {
  PLEventLocationWithEvents,
  FormattedLocationWithEvents,
  PLEvent
} from './pl-event-locations.types';
import { Cron } from '@nestjs/schedule';
import { NotificationService } from '../notifications/notifications.service';
import { MembersService } from '../members/members.service';
import { isEmpty } from 'lodash';
import { PLEventGuestsService } from './pl-event-guests.service';

@Injectable()
export class PLEventLocationsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private memberSubscriptionService: MemberSubscriptionService,
    private memberService: MembersService,
    private notificationService: NotificationService,
    @Inject(forwardRef(() => PLEventGuestsService))
    private plEventGuestService: PLEventGuestsService,
  ) { }

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
              additionalInfo: true,
              location: true,
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
      if (queryOptions.select) {
        // If select is present, use the query as-is
        const locations = await this.prisma.pLEventLocation.findMany(queryOptions);
        // No transformation, just return as is (cast for compatibility)
        return locations as unknown as FormattedLocationWithEvents[];
      }
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
              logo: {
                select: {
                  uid: true,
                  url: true
                }
              },
              banner: {
                select: {
                  uid: true,
                  url: true
                }
              },
              resources: true,
              additionalInfo: true,
              priority: true,
              eventGuests: {
                select: {
                  member: {
                    select: {
                      uid: true,
                      name: true,
                      image: {
                        select: {
                          url: true
                        }
                      }
                    }
                  },
                  team:{
                    select:{
                      uid: true,
                      name: true
                    }
                  },
                  isHost: true,
                  isSpeaker: true,
                  isSponsor: true,
                }
              }
            },
            orderBy: {
              priority: "asc"
            }
          }
        }
      });
      return locations.map((location) => {
        const formattedEvents: any = location.events.map((event) => ({
          ...event,
          eventGuests: event.eventGuests?.length ? this.groupEventGuestsByMemberUidAndTeamUid(event.eventGuests) : []
        }));
        return this.formatLocation({
          ...location,
          events: formattedEvents
        });
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
   * Groups event guests by `memberUid` and `teamUid`.
   *
   * @param eventGuests Array of event guest objects to group.
   * @returns An array of grouped guests, where each group includes `member`, `teamUid`.
   */
  groupEventGuestsByMemberUidAndTeamUid(eventGuests: {
    member: { uid: string; name: string; image?: { url: string } | null };
    team: {uid: string; name: string} | null;
    isHost: boolean;
    isSpeaker: boolean;
    isSponsor: boolean;
  }[]) {
    const groupedGuests = {};
    eventGuests?.forEach((guest) => {
      const key = `${guest.member.uid}-${guest.team?.uid}`;
      if (!groupedGuests[key])
        groupedGuests[key] = {
          member: guest.member,
          isHost: guest.isHost,
          isSpeaker: guest.isSpeaker,
          isSponsor: guest.isSponsor,
          team: guest.team,
        };
    });
    return Object.values(groupedGuests);
  }


  /**
   * This method separates the events of a location into past and upcoming based on the timezone.
   * @param events An array of event objects associated with the location
   * @param timezone The timezone of the location
   * @returns An object containing two arrays: pastEvents and upcomingEvents
   *   - Events are classified as past or upcoming depending on whether their start date is before or after the current time.
   */
  private segregateEventsByTime(events: PLEvent[], timezone: string): { pastEvents: PLEvent[], upcomingEvents: PLEvent[] } {
    const currentDateTimeInZone = moment().tz(timezone);
    const pastEvents: any = [];
    const upcomingEvents: any = [];
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

  /**
   * Finds a location by its unique identifier.
   *
   * @param {string} uid - The unique identifier of the location to be retrieved.
   * @returns plEvent location The location object if found, otherwise `null`.
   * @throws {Error} - If an error occurs during the query, it is passed to the `handleErrors` method.
   *
   */
  async findLocationByUid(uid: string) {
    try {
      return this.prisma.pLEventLocation.findUnique({
        where: { uid },
        select: {
          location: true
        }
      })
    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
     * Subscribes a member to a location by its unique identifier.
     *
     * @function subscribeLocationByUid
     * @param {string} uid - The unique identifier of the location to subscribe to.
     * @param {string} memberUid - The unique identifier of the member subscribing to the location.
     * @param {string} action - Action to perform
     * @returns {Promise<Object>} - The subscription object returned from the `createSubscription` method.
     * @throws {Error} - If an error occurs during the subscription process, it will be passed to the `handleErrors` method.
     *
     */
  async subscribeLocationByUid(uid: string, memberUid: string, action: string = "Default") {
    try {
      const subscriptions = await this.memberSubscriptionService.getSubscriptions({
        where: {
          memberUid,
          entityUid: uid,
          entityAction: action
        }
      });
      if (subscriptions?.length && !subscriptions[0].isActive) {
        const subscription = subscriptions[0];
        return await this.memberSubscriptionService.modifySubscription(subscription.uid, { isActive: true });
      }
      if (subscriptions?.length) {
        this.logger.info(`Member with uid ${memberUid} is already subscribed to location ${uid}.`);
        return null;
      }
      return await this.memberSubscriptionService.createSubscription({
        memberUid,
        entityUid: uid,
        entityType: SubscriptionEntityType.EVENT_LOCATION,
        entityAction: action
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * This method is executed on a cron schedule every two days once
   * It queries the database for location data associated with events, hosts, speakers, sponsors, and participant counts.
   * After retrieving the data, it notifies subscribers if certain threshold is met
   */
  @Cron(process.env.IRL_NOTIFICATION_CRON || '0 0 * * *')
  async handleCron() {
    try {
      this.logger.info('Notification initiated by cron');
      const query: any = `
      WITH LatestNotificationDate AS (
        SELECT
          n."entityUid",
          MAX(n."createdAt") AS latest_createdAt
        FROM "Notification" n
        WHERE (n."status"='SENT'AND "entityType"='EVENT_LOCATION'
        AND n."entityAction"='IRL_UPDATE' )  -- Get the latest 'createdAt' for each 'entityUid' where status is 'SENT'
        GROUP BY n."entityUid"              -- Group by entityUid to get the latest created date for each entity
      )
      SELECT
        el."uid",
        el."location",
        CASE                                -- cases to seggregate data into hosts and speakers
          WHEN COUNT(events.uid) > 0 THEN   -- Aggregate the events if exists
            jsonb_agg(                      -- Aggregate distinct events as JSON objects
              DISTINCT jsonb_build_object(
              'uid', events.uid,
              'name', events.name
              )
            )
          ELSE NULL
        END AS events,

      jsonb_agg(
        DISTINCT CASE
          WHEN pg."isHost" THEN       -- Aggregate guests if the participant is a host
            jsonb_build_object(
              'uid', pg."memberUid",
              'name', m."name"
            )
          ELSE NULL
        END
        ) FILTER (                -- Filter hosts by created/updated at or after latest notification date, or today
        WHERE pg."isHost" = TRUE
          AND (
             (pg."updatedAt" >= (SELECT latest_createdAt FROM LatestNotificationDate ln WHERE ln."entityUid" = el."uid"))
          )) AS hosts,

      jsonb_agg(
        DISTINCT CASE
          WHEN pg."isSpeaker" THEN      -- Aggregate guests if the participant is a speaker
            jsonb_build_object(
              'uid', pg."memberUid",
              'name', m."name"
            )
          ELSE NULL
        END
      ) FILTER (                    -- Filter speakers by created/updated at or after latest notification date, or today
          WHERE pg."isSpeaker" = TRUE
            AND (
              (pg."updatedAt" >= (SELECT latest_createdAt FROM LatestNotificationDate ln WHERE ln."entityUid" = el."uid"))
        )
      ) AS speakers,

      jsonb_agg(
        DISTINCT CASE
          WHEN pg."isSponsor" THEN      -- Aggregate guests if the participant is a sponsor
            jsonb_build_object(
              'uid', pg."memberUid",
              'name', m."name"
            )
          ELSE NULL
        END
      ) FILTER (                    -- Filter sponsors by created/updated at or after latest notification date, or today
          WHERE pg."isSponsor" = TRUE
            AND (
              (pg."updatedAt" >= (SELECT latest_createdAt FROM LatestNotificationDate ln WHERE ln."entityUid" = el."uid"))
        )
      ) AS sponsors

    FROM
      "PLEventLocation" el
      JOIN "PLEvent" e ON e."locationUid" = el.uid
      LEFT JOIN "PLEventGuest" pg ON pg."eventUid" = e.uid
      LEFT JOIN "Member" m ON m."uid" = pg."memberUid"
      LEFT JOIN (
        SELECT DISTINCT
          e."locationUid",
          e."uid",
          e."name"
        FROM "PLEvent" e
        WHERE                --fetch the events added after latest notification date,or today
          (e."createdAt" >= (SELECT latest_createdAt FROM LatestNotificationDate ln WHERE ln."entityUid" = e."locationUid"))
          )AS events ON events."locationUid" = el."uid"
    GROUP BY
      el."uid",
      el."location";`

      const locations = await this.prisma.$queryRawUnsafe(query);
      await this.notifySubscribers(locations)
    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
   * Notifies subscribers based on the fetched location.
   *
   * @param {Array} data - The location data containing the data about latest updates.
   *
   * This method loops through each location and checks for latest updates
   * if exceeds a threshold (IRL_THRESHOLD) it constructs and sends an email
   * notification to the subscribers for that location.
   */
  private async notifySubscribers(data) {
    try {
      await Promise.all(
        data.map(async (location) => {
          this.logger.info(`Processing to send notification for ${location.location}`)
          let participantsCount = 0;
          let hostCount = 0;
          let speakerCount = 0;
          let sponsorCount = 0;
          let eventCount = 0;
          if (location?.events?.length) {
            eventCount = location?.events.length;
          }
          if (location?.hosts?.length) {
            hostCount = location?.hosts.length;
          }
          if (location?.speakers?.length) {
            speakerCount = location?.speakers.length;
          }
          if (location?.sponsors?.length) {
            sponsorCount = location?.sponsors.length;
          }

          participantsCount = hostCount + speakerCount + sponsorCount + eventCount;
          if (participantsCount >= (Number(process.env.IRL_NOTIFICATION_THRESHOLD) || 10)) {
            const notification = await this.notificationService.getNotificationPayload(location.uid, "IRL_UPDATE");
            const payload = await this.buildConsolidatedEmailPayload(location, notification, eventCount, hostCount, speakerCount, sponsorCount);
            await this.notificationService.sendNotification(payload)
          } else {
            this.logger.info(`Threshold not reached for sending notification in ${location.location}`)
          }
        })
      );
    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
   * Builds the consolidated email payload for the notification.
   *
   * @param locationData Data containing records of latest updates in a specific location.
   * @param notification The notification payload to be sent.
   * @returns The updated notification payload with additional information for email.
   */
  private async buildConsolidatedEmailPayload(locationData, notification, eventCount, hostCount, speakerCount, sponsorCount) {
    const requestor = await this.memberService.findMemberByRole();
    notification.additionalInfo = {
      location: locationData.location,
      rsvpLink: process.env.IRL_BASEURL,
      irlPageLink: `${process.env.IRL_BASEURL}?location=${locationData.location}`,
      speakers: await this.buildGuestPayload(locationData.speakers, process.env.IRL_GUEST_BASEURL) || [],
      hosts: await this.buildGuestPayload(locationData.hosts, process.env.IRL_GUEST_BASEURL) || [],
      sponsors: await this.buildGuestPayload(locationData.sponsors, process.env.IRL_GUEST_BASEURL) || [],
      events: await this.buildEventsPayload(locationData.events, process.env.IRL_BASEURL, locationData.location) || [],
      sourceUid: requestor?.uid,
      sourceName: requestor?.name,
      guestBaseUrl: process.env.IRL_GUEST_BASEURL,
      irlBaseUrl: process.env.IRL_BASEURL,
      hostCount: hostCount,
      speakerCount: speakerCount,
      sponsorCount: sponsorCount,
      eventCount: eventCount,
    }
    this.logger.info(`Successfully built email payload for ${locationData.location}`)
    return notification;
  }

  /**
   * Builds the events payload for the email based on the events data.
   *
   * @param events The list of events associated with the location.
   * @param baseUrl The base URL for events.
   * @param location The location associated with the events.
   * @returns modified events list with URLs.
   */
  private async buildEventsPayload(events, baseUrl, location) {
    if (isEmpty(events) || events == null) {
      return []
    }
    const selectedEvents = await events?.slice(0, 3)       //pass only the first three events in email payload
    selectedEvents?.map(event => {
      if (!event || event == null) {
        return;
      }
      const eventUrl = `${baseUrl}?location=${location}`;
      event.url = eventUrl;
    });
    return selectedEvents;
  }

  /**
   * Builds the guests payload for the email based on the guest data.
   *
   * @param guests The list of guests added as host/speaker/sponsor.
   * @param baseUrl The base URL for member.
   * @returns modified guests list with URLs.
   */
  private async buildGuestPayload(guests, baseUrl) {
    if (isEmpty(guests) || guests == null) {
      return []
    }
    const selectedGuests = guests?.slice(0, 3)
    selectedGuests?.map(guest => {                 //pass only the first three guests in email payload
      const guestUrl = `${baseUrl}/${guest.uid}`;
      guest.url = guestUrl;
    });
    return selectedGuests;
  }


  /**
   * This method retrieves the event location by its UID, including all associated events and subscribers.
   * @returns The event location object with associated events
   *   - The events include details such as name, type, description, startDate, endDate, and additional info.
   *   - returns empty if no featued location is found.
   */
  async getFeaturedLocationsWithSubscribers(queryOptions: Prisma.PLEventLocationFindManyArgs, loggedlnMember) {
    try {
      const locations = await this.getPLEventLocations({ ...queryOptions });
      const locationUids = locations.flatMap(location => location.uid);
      const subscribers = await this.memberSubscriptionService.getSubscriptions({
        where: {
          AND: {
            entityUid: {
              in: locationUids
            },
            isActive: true,
          }
        },
        include: {
          member: {
            select: {
              uid: true,
              name: true,
              image: true,
            }
          }
        }
      });
      const result = await Promise.all(
        locations.map(async (location) => {
          // Process upcomingEvents only if they exist
          const filteredEvents = location.upcomingEvents
            ? await this.plEventGuestService.filterEventsByAttendanceAndAdminStatus([], location.upcomingEvents, loggedlnMember)
            : [];

          // Attach filtered events to the location object
          location.upcomingEvents = filteredEvents;

          // Attach subscribers to the location

          const filteredSubscribers = subscribers?.filter(sub => sub.entityUid == location.uid);
          return {
            ...location,                            // Spread existing properties of location
            subscribers: filteredSubscribers || []  // Introduce subscribers for corresponding location.
          };
        })
      );
      return result;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Creates a new event location.
   *
   * @param location The location data to be created.
   * @returns The created location object or existing location if found within deviation.
   * @throws {Error} - If an error occurs during the creation process, it will be passed to the `handleErrors` method.
   */
  async createPLEventLocation(location: Prisma.PLEventLocationUncheckedCreateInput) {
    try {
      this.logger.info(`location data : , ${location}`);
      
      // First, check if a location with the same city name exists
      const existingLocation = await this.prisma.pLEventLocation.findFirst({
        where: {
          location: location.location
        }
      });

      if (existingLocation) {
        // Calculate the deviation between existing and new coordinates
        const latitudeDeviation = Math.abs(parseFloat(existingLocation.latitude) - parseFloat(location.latitude));
        const longitudeDeviation = Math.abs(parseFloat(existingLocation.longitude) - parseFloat(location.longitude));

        // Check if deviation is within provided degrees
        if (latitudeDeviation <= Number(process.env.ALLOWED_LATITUDE_DEVIATION || 2) && longitudeDeviation <= Number(process.env.ALLOWED_LONGITUDE_DEVIATION || 2)) {
          this.logger.info(`Location already exists with similar coordinates. City: ${location.location}, Existing: (${existingLocation.latitude}, ${existingLocation.longitude})`);
          return existingLocation;
        }
      }

      // If no existing location found or deviation is greater than 2 degrees, create new location
      const createdLocation = await this.prisma.pLEventLocation.create({
        data: location
      });
      this.logger.info(`New location created: ${createdLocation.location}`);
      return createdLocation;
    } catch (error) {
      this.logger.error(`location error : , ${error}`);
      // Check for unique constraint violation on latitude and longitude
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        // Find the existing location by latitude and longitude
        this.logger.info(`Location already exists with latitude: ${location.latitude} and longitude: ${location.longitude}`);
        return null;
      }
      this.handleErrors(error);
    }
  }


}

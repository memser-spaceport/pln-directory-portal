import { Injectable, NotFoundException, ConflictException, BadRequestException, forwardRef, Inject, InternalServerErrorException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma, Member, NotificationStatus, SubscriptionEntityType, Team } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import {
  CreatePLEventGuestSchemaDto,
  UpdatePLEventGuestSchemaDto
} from 'libs/contracts/src/schema';
import {
  FormattedLocationWithEvents,
  PLEvent
} from './pl-event-locations.types';
import { CacheService } from '../utils/cache/cache.service';
import { NotificationService } from '../notifications/notifications.service';
import { CREATE, EVENT_GUEST_PRESENCE_REQUEST_TEMPLATE_NAME, EventInvitationToMember, UPDATE } from '../utils/constants';
import { AwsService } from '../utils/aws/aws.service';
import { PLEventsService } from './pl-events.service';
import { TeamsService } from '../teams/teams.service';
import path from 'path';

@Injectable()
export class PLEventGuestsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private memberService: MembersService,
    @Inject(forwardRef(() => PLEventLocationsService))
    private eventLocationsService: PLEventLocationsService,
    private cacheService: CacheService,
    private notificationService: NotificationService,
    private teamService: TeamsService,
    private awsService: AwsService,
    @Inject(forwardRef(() => PLEventsService))
    private eventService: PLEventsService
  ) { }

  /**
   * This method creates multiple event guests for a specific location.
   * @param data Data required for creating event guests, such as event and member details
   * @param member The member object initiating the creation of event guests
   *   - Admins can create guests for other members, while non-admins create guests for themselves.
   * @returns The result of creating multiple event guests
   *   - Resets the cache after creation.
   */
  async createPLEventGuestByLocation(
    data: CreatePLEventGuestSchemaDto,
    member: Member,
    locationUid: string,
    requestorEmail: string,
    location: { location: string },
    type: string = CREATE,
    tx?: Prisma.TransactionClient,
    eventType?: string
  ) {
    try {
      const isAdmin = this.memberService.checkIfAdminUser(member);
      await this.updateMemberDetails(data, member, isAdmin, tx);
      data.memberUid = isAdmin ? data.memberUid : member.uid;
      const guests = this.formatInputToEventGuests(data);
      const eventMember: Member = await this.memberService.findMemberByUid(data.memberUid);
      const plEvents: PLEvent[] = await this.getPLEventsByMemberAndLocation(eventMember, locationUid);
      const result = await (tx || this.prisma).pLEventGuest.createMany({ data: guests });
      if (type === CREATE) {
        await this.eventLocationsService.subscribeLocationByUid(locationUid, data.memberUid);
        this.memberService.checkIfAdminUser(member) && !plEvents.length &&
          (await this.sendEventInvitationIfAdminAddsMember(eventMember, location));
      }
      await this.updateGuestTopicsAndReason(data, locationUid, member, eventType, tx);
      this.cacheService.reset({ service: 'PLEventGuest' });
      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  };


  /**
   * This method checks if the member has events at the specified location. If no events are found,
   * an invitation email is sent to the member with the event location details.
   *
   * @param eventMember The member object being checked and invited, including their name and email.
   * @param location The location object containing details such as the location name.
   * @returns A Promise that resolves when the email is successfully sent or does nothing if the member already has events at the location.
   *   - Handles errors such as issues with retrieving events or sending emails.
   */
  async sendEventInvitationIfAdminAddsMember(eventMember: Member, location: { location: string }): Promise<any> {
    try {
      const eventData = {
        memberName: eventMember.name,
        location: location.location,
        eventLocationURL: `${process.env.WEB_UI_BASE_URL}/irl?location=${location.location}`,
      };
      await this.awsService.sendEmail(EventInvitationToMember, true, [eventMember.email], eventData);
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  /**
   * This method retrieves events associated with a specific member.
   * @param member The member object, including the member UID
   * @param locationUid The unique identifier of the event location
   * @returns An array of event objects where the member is a guest
   *   - Throws errors if there are issues with the query, including validation or database errors.
   */
  async getPLEventsByMemberAndLocation(member: Member, locationUid: string): Promise<any> {
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
   * This method modifies event guests for upcoming events by first deleting existing guests and then creating new ones.
   * @param data Data required for modifying event guests, such as event and member details
   * @param location The location object containing the upcoming events
   * @param member The member object initiating the modification
   * @returns The result of modifying event guests for upcoming events
   *   - Deletes the existing guests and calls the `createPLEventGuestByLocation` method for new guests.
   */
  async modifyPLEventGuestByLocation(
    data: UpdatePLEventGuestSchemaDto,
    location: FormattedLocationWithEvents,
    member: Member,
    requestorEmail: string,
    type: string
  ) {
    try {
      const events = type === "upcoming" ? location.upcomingEvents : location.pastEvents;
      return await this.prisma.$transaction(async (tx) => {
        const isAdmin = this.memberService.checkIfAdminUser(member);
        await tx.pLEventGuest.deleteMany({
          where: {
            memberUid: isAdmin ? data.memberUid : member.uid,
            eventUid: {
              in: events.map(event => event.uid)
            }
          }
        });
        return await this.createPLEventGuestByLocation(data, member, location.uid, requestorEmail, location, UPDATE, tx, type);
      });
    } catch (err) {
      this.handleErrors(err);
    }
  }


  /**
   * This method deletes event guests for a specific location and given members.
   * @param membersAndEvents An array of objects containing member and event UIDs
   * @returns The result of deleting event guests
   *   - Delete Guests from events , then resets the cache.
   */
  async deletePLEventGuests(membersAndEvents) {
    try {
      const deleteConditions = membersAndEvents.flatMap(({ memberUid, events }) =>
        events.map(eventUid => ({ memberUid, eventUid }))
      );
      const result = await this.prisma.pLEventGuest.deleteMany({
        where: {
          OR: deleteConditions
        }
      });
      await this.cacheService.reset({ service: 'PLEventGuest' });
      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  };

  /**
   * This method retrieves event guests by location and type (upcoming or past events).
   * @param locationUid The unique identifier of the event location
   * @param query Optional query parameters, such as sorting and filtering
   * @param isUserLoggedIn Boolean indicating whether the user is logged in
   * @returns An array of event guests, with sensitive details filtered based on login status
   *   - Applies member preferences on displaying details like telegramId and office hours.
   */
  async getPLEventGuestsByLocationAndType(
    locationUid: string,
    query,
    member
  ) {
    try {
      let events;
      const { type, filteredEvents } = query;
      if (type === "upcoming") {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === "past") {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }
      events = await this.filterEventsByAttendanceAndAdminStatus(filteredEvents, events, member);
      if (events.length === 0)
        return [];
      const result = await this.fetchAttendees({
        eventUids: events?.map(event => event.uid),
        ...query,
        loggedInMemberUid: member ? member?.uid : null
      });
      this.restrictTelegramBasedOnMemberPreference(result, member ? true : false);
      this.restrictOfficeHours(result, member ? true : false);
      return result;
    }
    catch (err) {
      this.handleErrors(err);
    }
  };

  /**
   * This method updates the member details such as Telegram ID and office hours based on the provided guest data.
   * @param guest The guest data object containing the updated details
   * @param member The member object to be updated
   * @param isAdmin Boolean indicating whether the current user is an admin
   *   - Admins can update other members' details, while non-admins can only update their own details.
   */
  async updateMemberDetails(
    guest: any,
    member: Member,
    isAdmin: boolean,
    tx?: Prisma.TransactionClient
  ) {
    if (isAdmin) {
      const guestMember = await this.memberService.findOne(guest.memberUid, {}, tx);
      await this.memberService.updateTelegramIfChanged(guestMember, guest.telegramId, tx);
      await this.memberService.updateOfficeHoursIfChanged(guestMember, guest.officeHours, tx);
    } else {
      await this.memberService.updateTelegramIfChanged(member, guest.telegramId, tx);
      await this.memberService.updateOfficeHoursIfChanged(member, guest.officeHours, tx);
    }
  }

  /**
  * Fetches all PLEventGuests for a given location, filtered by the upcoming events at that location.
  *
  * @param {string} locationUid - The UID of the location to get event guests for.
  * @param {Prisma.PLEventGuestFindManyArgs} query - Optional query arguments, including orderBy.
  * @returns {Promise<PLEventGuest[]>} - A promise that resolves to an array of PLEventGuest records, including member and team details.
  * @throws Will log an error and throw an appropriate HTTP exception if something goes wrong.
  */
  async getPLEventGuestsByLocation(
    locationUid: string,
    query: Prisma.PLEventGuestFindManyArgs
  ) {
    try {
      const events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      return await this.prisma.pLEventGuest.findMany({
        where: {
          eventUid: {
            in: events.map(event => event.uid)
          },
          ...query.where
        },
        select: {
          memberUid: true,
          isHost: true,
          isSpeaker: true,
          isSponsor: true,
          isFeatured: true,
          topics: true,
          event: {
            select: {
              uid: true,
              name: true,
              websiteURL: true,
              startDate: true,
              endDate: true
            }
          },
          team: {
            select: {
              uid: true,
              name: true
            }
          },
          member: {
            select: {
              name: true,
              image: {
                select: {
                  url: true
                }
              }
            }
          }
        },
        orderBy: query.orderBy
      });
    }
    catch (err) {
      this.handleErrors(err);
    }
  };

  /**
   * This method checks whether all provided events are upcoming based on the list of upcoming events.
   * @param upcomingEvents An array of upcoming events
   * @param events An array of events to check
   * @returns Boolean indicating whether all provided events are upcoming.
   */
  checkIfEventsAreUpcoming(upcomingEvents: PLEvent[], events) {
    return events.every((event) => {
      return upcomingEvents.some((upcomingEvent) => {
        return upcomingEvent.uid === event.uid;
      });
    });
  };

  /**
   * This method formats the input data to create event guests with the required details for each event.
   * @param input The input data containing details such as events, topics, telegram ID, office hours, etc.
   * @returns An array of formatted event guest objects to be inserted into the database.
   */
  private formatInputToEventGuests(input: CreatePLEventGuestSchemaDto) {
    return input.events.map((event) => {
      const additionalInfo = {
        ...input.additionalInfo,
        hostSubEvents: event.hostSubEvents || [],
        speakerSubEvents: event.speakerSubEvents || [],
        sponsorSubEvents: event.sponsorSubEvents || []
      };
      return {
        telegramId: input.telegramId || null,
        officeHours: input.officeHours || null,
        reason: input.reason || null,
        memberUid: input.memberUid,
        teamUid: input.teamUid,
        eventUid: event.uid,
        additionalInfo: additionalInfo,
        topics: input.topics || [],
        isHost: event.isHost || false,
        isSpeaker: event.isSpeaker || false,
        isSponsor: event.isSponsor || false
      };
    });
  };

  /**
   * This method restricts the visibility of Telegram IDs based on member preferences.
   * @param eventGuests An array of event guests
   * @param isUserLoggedIn Boolean indicating whether the user is logged in
   * @returns The event guests array with Telegram details filtered based on preferences.
   */
  restrictTelegramBasedOnMemberPreference(eventGuests, isUserLoggedIn: boolean) {
    if (isUserLoggedIn && eventGuests) {
      eventGuests = eventGuests.map((guest: any) => {
        if (!guest.member.preferences) {
          return guest;
        }
        if (!guest.member.preferences.showTelegram) {
          delete guest.member.telegramHandler;
          delete guest.telegramId;
        }
        return guest;
      });
    }
    return eventGuests;
  };

  /**
   * This method restricts the visibility of office hours based on login status.
   * @param eventGuests An array of event guests
   * @param isUserLoggedIn Boolean indicating whether the user is logged in
   * @returns The event guests array with office hours filtered for non-logged-in users.
   */
  restrictOfficeHours(eventGuests, isUserLoggedIn: boolean) {
    if (eventGuests && isUserLoggedIn) {
      eventGuests = eventGuests.map((guest: any) => {
        if (!guest.officeHours) {
          delete guest.member.officeHours;
        }
        return guest;
      });
    }
    return eventGuests;
  };

  /**
   * This method handles various types of database errors, especially related to event guests.
   * @param error The error object caught during operations
   * @param message Optional additional message to include in the exception
   *   - Throws ConflictException for unique constraint violations, BadRequestException for validation errors, and NotFoundException when an event is not found.
   */
  private handleErrors(error, message?) {
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
   * Filters out invite-only events based on user attendance, login state, and admin status.
   *
   * This function takes an array of events and a user ID. If the user is logged out, it removes
   * all invite-only events. If the user is logged in and is an admin, it returns all events without
   * filtering. If the user is logged in but not an admin, it only keeps invite-only events that
   * the user is attending.
   *
   * @param {PLEvent[]} events - Array of events to be filtered.
   * @param {string | null} userId - The UID of the logged-in user, or null if the user is logged out.
   * @returns {Promise<PLEvent[]>} Filtered array of events based on the user’s attendance, login state, and admin status.
   */
  async filterEventsByAttendanceAndAdminStatus(filteredEventsUid, events: PLEvent[], member): Promise<PLEvent[]> {
    if (filteredEventsUid?.length > 0 && !member) {
      return events.filter(event => filteredEventsUid?.includes(event.uid))
        .filter(event => event.type !== "INVITE_ONLY");
    }
    // If the user is logged out, remove all invite-only events
    if (!member) {
      return events.filter(event => event.type !== "INVITE_ONLY");
    }
    // If the user is an admin, return all events without filtering
    if (this.memberService.checkIfAdminUser(member)) {
      return filteredEventsUid?.length ? events.filter(event => filteredEventsUid.includes(event.uid)) : events;
    }
    // Scenario 2: If the user is logged in and not an admin, get invite-only events they are attending
    const userAttendedEvents = await this.prisma.pLEvent.findMany({
      where: {
        type: "INVITE_ONLY",
        eventGuests: {
          some: {
            memberUid: member.uid
          }
        }
      },
      select: {
        uid: true
      }
    });
    // Create a Set of attended invite-only event UIDs for efficient lookup
    const attendedEventUids = new Set(userAttendedEvents.map(event => event.uid));
    // Filter events to keep non-invite-only events and attended invite-only events
    if (filteredEventsUid?.length > 0) {
      return events.filter(event => filteredEventsUid?.includes(event.uid))
        .filter(event => event.type !== "INVITE_ONLY" || attendedEventUids.has(event?.uid));
    }
    return events.filter(event =>
      event.type !== "INVITE_ONLY" || attendedEventUids.has(event.uid)
    );
  }

  /**
   * Fetches event attendees with dynamic filtering, searching, sorting, and pagination.
   * Retrieves event, member, and team information for each attendee.
   *
   * @param {Object}  queryParams - Parameters for filtering, searching, sorting, and pagination.
   * @param {Array}   queryParams.eventUids - List of event UIDs to filter attendees.
   * @param {boolean} queryParams.isHost - Filter by whether the attendee is a host.
   * @param {boolean} queryParams.isSpeaker - Filter by whether the attendee is a speaker.
   * @param {boolean} queryParams.isSponsor - Filter by whether the attendee is a sponsor.
   * @param {string}  queryParams.sortBy - Field by which to sort results (member, team).
   * @param {string}  queryParams.sortDirection - Direction of sorting (asc, desc).
   * @param {string}  queryParams.search - Search term to filter results by member name, team name, or project name.
   * @param {number}  queryParams.limit - Number of records to return per page.
   * @param {number}  queryParams.page - Current page number for pagination.
   * @param {userEmail} queryParams.userEmail - The email of the logged-in user.
   * @returns {Promise<Array>} A list of attendees with their associated member, team, and event information.
   */
  async fetchAttendees(queryParams) {
    const { eventUids, isHost, isSpeaker, isSponsor, topics, sortBy, sortDirection = 'asc', search, limit = 10, page = 1, loggedInMemberUid, includeLocations } = queryParams;
    // Build dynamic query conditions for filtering by eventUids, isHost, and isSpeaker
    let { conditions, values } = this.buildConditions(eventUids, topics);
    // Apply sorting based on the sortBy parameter (default is sorting by memberName)
    const orderBy = this.applySorting(sortBy, sortDirection, loggedInMemberUid);

    // Apply pagination to limit the results and calculate the offset for the current page
    const { limit: paginationLimit, offset } = this.applyPagination(Number(limit), page);

    const selectLocation = includeLocations
      ? `,'location', l."location"`
      : ``; // Empty if location is not required


    // Determine the position of the eventUid placeholder in the SQL query's values array
    // If search is enabled, adjust the position accordingly

    /*
      Position Breakdown:
      - LIMIT placeholder → `$${values.length + 1}`
      - OFFSET placeholder → `$${values.length + 2}`
      - If search is enabled, an extra placeholder is used for search filters:
        - Search placeholder → `$${values.length + 3}`
        - EventUid placeholder → `$${values.length + 4}`
      - Otherwise:
        - EventUid placeholder → `$${values.length + 3}`
    */

    const eventPosition = search ? values.length + 4 : values.length + 3;

    // Construct the raw SQL query for fetching attendees with joined tables and aggregated JSON data
    const query: any = `
      SELECT
        *,
        COUNT(*) OVER() AS count FROM (
        SELECT
          pg."memberUid",
          CASE   --check the guestType of the guest in the events in specified locations
            WHEN BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventPosition})) --eventUid's index in values array
               AND NOT BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventPosition}))
               AND NOT BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventPosition}))
            THEN 'isHostOnly'
            WHEN BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventPosition}))
               AND NOT BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventPosition}))
               AND NOT BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventPosition}))
            THEN 'isSpeakerOnly'
            WHEN BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventPosition}))
               AND NOT BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventPosition}))
               AND NOT BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventPosition}))
            THEN 'isSponsorOnly'
            WHEN BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventPosition}))
               AND BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventPosition}))
               AND BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventPosition}))
            THEN 'hostAndSpeakerAndSponsor'
            ELSE 'none'
          END AS guest_type,
          json_object_agg(
            'info',
            json_build_object(
              'reason', pg."reason",
              'teamUid', pg."teamUid",
              'topics', pg."topics",
              'isHost', pg."isHost",
              'isSpeaker', pg."isSpeaker",
              'isSponsor', pg."isSponsor",
              'createdAt', pg."createdAt",
              'telegramId', pg."telegramId",
              'officeHours', pg."officeHours"
            )
          ) AS guest,
          json_agg(
            DISTINCT jsonb_build_object(
              'uid', e.uid,
              'slugURL', e."slugURL",
              'name', e.name,
              'type', e.type,
              'startDate', e."startDate",
              'endDate', e."endDate",
              'isHost', pg."isHost",      -- Event-specific host details
              'isSpeaker', pg."isSpeaker", -- Event-specific speaker details
              'isSponsor', pg."isSponsor", -- Event-specific sponsor details
              'additionalInfo', pg."additionalInfo"
               ${selectLocation}
            )
          ) AS events,
          json_object_agg(
            'member',
            json_build_object(
              'name', m.name,
              'image', json_build_object('url', mi.url),
              'telegramHandler', m."telegramHandler",
              'preferences', m.preferences,
              'officeHours', m."officeHours"
            )
          ) AS member,
          COALESCE(   -- Ensure that if the aggregation results in NULL, it returns an empty JSON array instead
            jsonb_agg(
                DISTINCT jsonb_build_object(
                  'role', tmr."role",
                  'team', jsonb_build_object(
                  'uid', tmr_team.uid,
                  'name', tmr_team.name,
                  'logo', jsonb_build_object('url', tmr_logo.url)
                )
              )
            ) FILTER (WHERE tmr_team.uid IS NOT NULL),  -- Exclude NULL teams from the aggregation
            '[]'::jsonb     -- Default to an empty JSON array if no valid team member roles exist
          ) AS teamMemberRoles,
          json_object_agg(
            'team',
            json_build_object(
              'uid', tm.uid,
              'name', tm.name,
              'logo', json_build_object('url', tml.url)
            )
          ) AS team
        FROM "PLEventGuest" pg
        JOIN "PLEvent" e ON e.uid = pg."eventUid"
        ${this.joinEventLocations(includeLocations)}
        LEFT JOIN "Image" el ON el.uid = e."logoUid"
        LEFT JOIN "Image" eb ON eb.uid = e."bannerUid"
        JOIN "Member" m ON m.uid = pg."memberUid"
        LEFT JOIN "Image" mi ON mi.uid = m."imageUid"
        LEFT JOIN "TeamMemberRole" tmr ON tmr."memberUid" = m.uid
        LEFT JOIN "Team" tmr_team ON tmr_team.uid = tmr."teamUid"
        LEFT JOIN "Image" tmr_logo ON tmr_logo.uid = tmr_team."logoUid"
        LEFT JOIN "ProjectContribution" pc ON pc."memberUid" = m.uid
        LEFT JOIN "Project" pc_project ON pc_project.uid = pc."projectUid"
        LEFT JOIN "Project" cp ON cp."createdBy" = m.uid
        LEFT JOIN "Team" tm ON tm.uid = pg."teamUid"
        LEFT JOIN "Image" tml ON tml.uid = tm."logoUid"
        ${this.applySearch(values, search)}
        GROUP BY
          pg."memberUid",
          pg."teamUid",
          pg."topics",
          pg."reason",
          m.name,
          tm.name
        ${conditions} -- Add the dynamically generated conditions for filtering
        ${orderBy} -- Apply sorting logic
      )
      AS subquery
      ${this.buildHostAndSpeakerCondition(isHost, isSpeaker, isSponsor)}
      LIMIT $${values.length + 1}
      OFFSET $${values.length + 2} -- Apply pagination limit and offset
    `;
    // Add pagination values to the query parameters for limit and offset
    values.push(paginationLimit, offset);
    values.push(eventUids);
    // Execute the raw query with the built query string and values
    const result = await this.prisma.$queryRawUnsafe(query, ...values);
    return this.formatAttendees(result);
  }

  /**
   *
   * @param includeLocation query param to specify whether to include location or not
   * @returns join query for event location is specified
   */
  private joinEventLocations(includeLocation: boolean) {
    if (includeLocation) {
      return `LEFT JOIN "PLEventLocation" l ON l.uid = e."locationUid"`
    }
    return "";
  }

  /**
   * Formats the raw attendee query results to a structured object format.
   * This function maps through each result item to structure it with necessary
   * details like member information, guest information, event count, and team data.
   *
   * @param {Array} result - Raw array of attendee data returned from the query.
   * @returns {Array} Formatted array of attendees with organized properties.
   */
  private formatAttendees(result) {
    return result.map((attendee) => {
      let guestInfo = { ...attendee?.guest?.info };
      guestInfo.teamUid = this.getGuestsActiveTeam(attendee?.teammemberroles, guestInfo?.teamUid) ? guestInfo?.teamUid : null;
      return {
        // Total count of members after filtering, represented by totalMembers
        count: Number(BigInt(attendee.count || '0n')),

        memberUid: attendee.memberUid,
        // Spread guest information if available, including attributes like isHost, isSpeaker and isSponsor
        ...guestInfo,
        events: attendee.events,
        member: {
          ...attendee?.member?.member,
          teamMemberRoles: attendee?.teammemberroles
        },
        team: this.getGuestsActiveTeam(attendee?.teammemberroles, attendee?.team?.team) ? attendee?.team?.team : {}
      }
    });
  }

  /**
   * Builds dynamic SQL conditions for filtering event guests based on provided criteria.
   *
   * This function creates a SQL conditions string and an array of values for binding in the query.
   * Conditions are added for filtering by eventUids, isHost, isSpeaker, isSponsor and topics.
   *
   * @param {Array} eventUids - List of event UIDs for filtering.
   * @param {Array} topics - List of topics to filter by using the overlap operator.
   * @returns {Object} An object containing the SQL conditions string and associated values for query binding.
   */
  buildConditions(eventUids, topics) {
    const conditions: string[] = [];
    const values: any = [];
    // Add a condition to filter by event UIDs if provided
    if (eventUids && eventUids.length > 0) {
      conditions.push(`ARRAY[${eventUids?.map((_, i) => `$${i + 1}`).join(", ")}] && array_agg(e.uid)`);
      values.push(...eventUids);
    }
    // Add a condition for topics if provided, using the overlap operator (&&)
    if (topics && topics.length > 0) {
      conditions.push(`pg."topics" && $${values.length + 1}`);
      values.push(topics);
    }
    // Combine conditions into a single WHERE clause if any conditions are present
    const conditionsString = conditions.length > 0 ? ` Having ${conditions.join(" AND ")} ` : '';
    return { conditions: conditionsString, values };
  }

  /**
   * Builds a SQL condition string based on the host and speaker status.
   *
   * @param {string} isHost - Indicates if the guest is a host (expected values: "true" or "false").
   * @param {string} isSpeaker - Indicates if the guest is a speaker (expected values: "true" or "false").
   * @param {string} isSponsor - Indicates if the guest is a sponsor (expected values: "true" or "false").
   * @returns {string} - A SQL condition string to filter guests based on their type.
   */
  buildHostAndSpeakerCondition(isHost, isSpeaker, isSponsor) {
    // Check if the guest is both a host and a speaker
    if (isHost === "true" && isSpeaker === "true" && isSponsor === "true") {
      return ` WHERE guest_type = 'hostAndSpeakerAndSponsor' `; // Return condition for both host, speaker and sponsor
    }
    // Check if the guest is only a host
    else if (isHost === "true") {
      return ` WHERE guest_type = 'isHostOnly' `; // Return condition for host only
    }
    // Check if the guest is only a speaker
    else if (isSpeaker === "true") {
      return ` WHERE guest_type = 'isSpeakerOnly' `; // Return condition for speaker only
    }
    // Check if the guest is only a speaker
    else if (isSponsor === "true") {
      return ` WHERE guest_type = 'isSponsorOnly' `; // Return condition for sponsor only
    }
    return '';
  }

  /**
   * Applies search filters to the SQL query for filtering by member, team, or project names.
   *
   * @param {string} conditions - The current SQL conditions string.
   * @param {Array} values - The current values for query binding.
   * @param {string} search - The search term to filter by member name, team name, or project names.
   * @returns {Object} Updated conditions and values for the SQL query after applying search filters.
   */
  applySearch(values, search: string) {
    // Add a condition to search by member name, team name, or project names (either contributed or created)
    if (search) {
      values.push(`%${search}%`);
      return ` WHERE
        m."name" ILIKE $${values.length} OR
        tm."name" ILIKE $${values.length} OR
        pc_project."name" ILIKE $${values.length} OR
        cp."name" ILIKE $${values.length} `;
      // Append search term to the query values with wildcard matching
    }
    return ``;
  }

  /**
   * Applies sorting logic to the SQL query based on the provided sortBy parameter.
   *
   * @param {string} sortBy - The field by which to sort the results.
   *                          Can be 'memberName', 'teamName', or 'eventName'.
   * @returns {string} SQL orderBy clause to apply the sorting.
   */
  applySorting(sortBy: string, sortDirection: string, uid: string) {
    // Apply sorting based on the selected field
    switch (sortBy) {
      case "member":
        return 'ORDER BY m."name" ' + sortDirection;
      case "team":
        return 'ORDER BY tm."name" ' + sortDirection;
      default:
        const loggedInMemberOrder = uid
          ? `CASE WHEN pg."memberUid" = '${uid}' THEN 0 ELSE 1 END,` : '';
        return `
          ORDER BY
            ${loggedInMemberOrder}
            CASE
              WHEN pg."reason" IS NOT NULL AND array_length(pg."topics", 1) > 0 THEN 1
              WHEN array_length(pg."topics", 1) > 0 THEN 2
              WHEN pg."reason" IS NOT NULL THEN 3
            ELSE 4
          END asc,
          m."name" ${sortDirection}
        `
    }
  }

  /**
  * This method retrieves list of unique event topics in provided location uid.
  * @param locationUid unique identifier of the location whose event topics are to be fetched.
  * @param type The type of events to filter by (either "upcoming" or "past")
  * @returns An array of unique topics for the specified location
  *   - Throws an error if the location is not found.
  */
  async getPLEventTopicsByLocationAndType(locationUid: string, type: string) {
    try {
      let events;
      if (type === "upcoming") {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === "past") {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }
      let uniqueTopics = await this.prisma.pLEventGuest.findMany({
        where: {
          eventUid: {
            in: events.map(event => event.uid)
          }
        },
        select: {
          topics: true,
        }
      });
      return Array.from(new Set(uniqueTopics.flatMap(guest => guest.topics)));
    }
    catch (err) {
      this.handleErrors(err);
    }
  }

  /**
   * Calculates pagination limits and offsets for SQL queries.
   *
   * @param {number} limit - The number of records per page.
   * @param {number} page - The current page number.
   * @returns {Object} An object containing limit and offset for the SQL query.
   */
  applyPagination(limit, page) {
    // Calculate the offset based on the current page and the limit per page
    const offset = (page - 1) * limit;
    return { limit, offset };
  }

  /**
   * Retrieves event guest information for a specific member at a specific location.
   *
   * This function retrieves upcoming events at the specified location, and then fetches
   * the corresponding guest records for a particular member across these events.
   * It includes detailed information about the event, member, team, and guest's role
   * within the event. Additionally, it applies restrictions on visibility of member
   * preferences based on the specified member UID.
   *
   * @param {string} memberUid - The UID of the member whose event guest information is being retrieved.
   * @param {string} locationUid - The UID of the location for which events are retrieved.
   * @returns {Promise<PLEventGuest>} An array of event guest records for the specified member
   *                           at the specified location.
   */
  async getPLEventGuestByUidAndLocation(
    memberUid: string,
    locationUid: string,
    isUserLoggedIn: boolean,
    type: string
  ) {
    try {
      let events;
      if (type === "upcoming") {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === "past") {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }
      const result = await this.prisma.pLEventGuest.findMany({
        where: {
          memberUid,
          eventUid: {
            in: events.map(event => event.uid)
          }
        },
        select: {
          uid: true,
          reason: true,
          memberUid: true,
          teamUid: true,
          topics: true,
          additionalInfo: true,
          isHost: true,
          isSpeaker: true,
          isSponsor: true,
          event: {
            select: {
              slugURL: true,
              uid: true,
              name: true,
              type: true,
              description: true,
              startDate: true,
              endDate: true,
              logo: { select: { url: true } },
              banner: { select: { url: true } },
              resources: true,
              additionalInfo: true
            }
          },
          member: {
            select: {
              name: true,
              image: { select: { url: true } },
              telegramHandler: isUserLoggedIn ? true : false,
              preferences: true,
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
              }
            }
          },
          team: {
            select: {
              uid: true,
              name: true,
              logo: { select: { url: true } }
            }
          },
          createdAt: true,
          telegramId: isUserLoggedIn ? true : false,
          officeHours: isUserLoggedIn ? true : false
        }
      });
      this.restrictTelegramBasedOnMemberPreference(result, isUserLoggedIn ? true : false);
      const formattedResult = await result.map((guest) => {
        return {
          ...guest,
          teamUid: this.getGuestsActiveTeam(guest.member.teamMemberRoles, guest.teamUid) ? guest.teamUid : null,
          team: this.getGuestsActiveTeam(guest.member.teamMemberRoles, guest.team) ? guest.team : {}// Update team object
        };
      })
      return formattedResult;
    } catch (err) {
      this.handleErrors(err);
    }
  }

  /**
   * This method constructs a dynamic query to search for the given text by either
   * member name or team name based on query parameters.
   * @param query An object containing `searchBy` (either 'member' or 'team') and `searchText` (the name to search for)
   * @returns Constructed query based on the given text input, using a `startsWith` filter.
   */
  buildSearchFilter(query) {
    const { searchBy, searchText } = query;
    if (searchBy === "member") {
      return {
        member: {
          name: {
            startsWith: searchText,
            mode: 'insensitive',
          },
        }
      };
    } else if (searchBy === "team") {
      return {
        team: {
          name: {
            startsWith: searchText,
            mode: 'insensitive'
          }
        }
      };
    } else {
      return {};
    }
  };

  /**
   * Retrieves the details of a host or speaker or sponsor for a specific event.
   * @param memberUid - The unique identifier of the member (host or speaker or sponsor).
   * @param eventUid - The unique identifier of the event.
   * @returns A Promise that resolves to the event guest details, including:
   * - Member information (e.g., name).
   * - Event information (e.g., name, startDate).
   * Returns `null` if no matching record is found.
   * @throws Throws an exception if there is an error in querying the database.
   */
  async getHostAndSpeakerDetailsByUid(memberUid: string, eventUid: string) {
    try {
      return await this.prisma.pLEventGuest.findFirst({
        where: {
          AND: {
            memberUid: memberUid,
            eventUid: eventUid
          }
        },
        include: {
          member: {
            select: {
              name: true,
              bio: true
            }
          },
          event: {
            select: {
              name: true,
              startDate: true,
              location: {
                select: {
                  location: true
                }
              }
            }
          }
        }
      })
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async getAllPLEventGuest() {
    return await this.fetchAttendees({
      eventUids: [],
      isHost: undefined,
      isSpeaker: undefined,
      isSponsor: undefined,
      topics: [],
      sortBy: 'memberName',
      sortDirection: 'asc',
      search: '',
      limit: Number.MAX_SAFE_INTEGER,  // Disable pagination
      page: 1,
      loggedInMemberUid: null,
      includeLocations: true
    });
  }

  /**
   * Determines the active team for a guest.
   * @param teamMemberRoles - List of roles the guest has in different teams.
   * @param team - The current team associated with the guest.
   * @returns The team object if the guest is part of the team, otherwise an empty object.
   */
  private getGuestsActiveTeam(teamMemberRoles, team: Partial<Team> | string | null) : Boolean {
    // check whether the given team is a members active team
    return teamMemberRoles?.some((role) => role?.team?.uid === (typeof team === 'string' ? team : team?.uid));
  }

  /**
   * Updates the topics and reason for a member across specific event UIDs.
   *
   * @param data - The update schema containing new topics and reason.
   * @param locationUid - The unique identifier of the location.
   * @param member - The member whose topics and reason need to be updated.
   * @param type - The event type, either "upcoming" or "past" (defaults to "upcoming").
   * @param tx - (Optional) Prisma transaction client to execute within a transaction context.
   *
   * @returns A Promise that resolves to the result of the update operation.
   *
   * @throws Throws an error if fetching location details or updating records fails.
   */
  async updateGuestTopicsAndReason(
    data: UpdatePLEventGuestSchemaDto,
    locationUid: string,
    member: Member,
    type: string = "upcoming",
    tx?: Prisma.TransactionClient) {
    const location = await this.eventLocationsService.getPLEventLocationByUid(locationUid);
    const events = type === "upcoming" ? location.pastEvents : location.upcomingEvents;
    const isAdmin = this.memberService.checkIfAdminUser(member);
    return await (tx || this.prisma).pLEventGuest.updateMany({
      where: {
        memberUid: isAdmin ? data.memberUid : member.uid,
        eventUid: {
          in: events.map(event => event.uid)
        }
      },
      data: {
        topics: data.topics,
        reason: data.reason,
        teamUid: data.teamUid,
        officeHours: data.officeHours
      }
    })
  }

  /**
   * Retrieves the topics and reason for a guest's participation in past events at a specific location.
   * @param locationUid The unique identifier for the location.
   * @param guestUid The unique identifier for the guest.
   * @returns The guest's topics and reason for participation in the most recent past event.
   *   - Events are sorted by updatedAt and createdAt in descending order to get latest data.
   *   - Throws an error if something goes wrong during retrieval.
   */
  async getGuestTopics(locationUid: string, guestUid: string) {
    try {
      const location = await this.eventLocationsService.getPLEventLocationByUid(locationUid);
      const eventUids = location.events.flatMap(event => event.uid);
      const result = await this.prisma.pLEventGuest.findFirst({
        where: {
          AND:{
            eventUid: {
              in: eventUids
            },
            memberUid: guestUid
          }
        },
        orderBy: [
          { updatedAt: 'desc' }
        ],
        select: {
          topics: true,
          reason: true
        }
      })
      if(!result) {
        return [];
      }
      return result;
    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
   * This method retrieves all aggregated event and location data.
   * @returns An object containing:
   * - `events`: An array of aggregated event objects.
   * - `locations`: An array of aggregated location objects.
   * @throws an `InternalServerErrorException` if an error occurs during data retrieval.
   */
  async getAllAggregatedData(loggedInMember) {
    try {
      return {
        events: await this.eventService.getPLEvents({ where: { isAggregated: true } }),
        locations: await this.eventLocationsService.getFeaturedLocationsWithSubscribers({ where: { isAggregated: true } }, loggedInMember)
      };
    } catch (error) {
      throw new InternalServerErrorException(`Error occured while retrieving aggregated data: ${error.message}`);
    }
  }

  enrichEvents(events) {
    return events.map((event) => ({
      ...event,
      rowspan: (event.hostSubEvents?.length || 0) + (event.speakerSubEvents?.length || 0) + (event.sponsorSubEvents?.length || 0),
    }));
  }

  /**
   * Sends an email to the Admin to add them as a guest to an event.
   * @param locationUid The unique identifier for the location.
   * @param guestUid The unique identifier for the guest.
   * @param body The body of the request.
   * @returns if the email is sent successfully.
   */
  async sendEventGuestPresenceRequest(userEmail: string, body) {
     try {
      let emailData = {
        locationName: body.locationName,
        memberName: body.memberName,
        events: this.enrichEvents(body.events) ?? [],
        email: userEmail,
      }
      if(body.teamUid) {
        const team = await this.teamService.findTeamByUid(body.teamUid);
        if (!team) {
          throw new NotFoundException('Team not found');
        }
        emailData['teamName'] = team.name;
      }else{
        emailData['teamName'] = '';
      }

      const adminEmailIdsEnv = process.env.SES_ADMIN_EMAIL_IDS;
      const adminEmailIds = adminEmailIdsEnv?.split('|') ?? [];

      const result = await this.awsService.sendEmailWithTemplate(
        path.join(__dirname, '/shared/markMyPresence.hbs'),
        {
          ...emailData
        },
        '',
        'Request to Log Attendance for Past In-Person Events',
        process.env.SES_SOURCE_EMAIL || '',
        adminEmailIds,
        []
      );
      this.logger.info(`New mark my presence request for ${userEmail} notified to support team ref: ${result?.MessageId}`);

      //const response = await this.awsService.sendEmail(EVENT_GUEST_PRESENCE_REQUEST_TEMPLATE_NAME, true, [], emailData);
      return {
        message: 'Email sent successfully'
      }
    } catch (error) {
      return this.handleErrors(error);
    }
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  forwardRef,
  Inject,
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma, Member, Team } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { PLEventLocationsService } from './pl-event-locations.service';
import { CreatePLEventGuestSchemaDto, UpdatePLEventGuestSchemaDto } from 'libs/contracts/src/schema';
import { FormattedLocationWithEvents, PLEvent } from './pl-event-locations.types';
import { CacheService } from '../utils/cache/cache.service';
import { CREATE, EventInvitationToMember, UPDATE, isIRLNotificationsEnabled } from '../utils/constants';
import { AwsService } from '../utils/aws/aws.service';
import { PLEventsService } from './pl-events.service';
import { TeamsService } from '../teams/teams.service';
import path from 'path';
import { IrlGatheringPushCandidatesService } from './push/irl-gathering-push-candidates.service';

@Injectable()
export class PLEventGuestsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private memberService: MembersService,
    @Inject(forwardRef(() => PLEventLocationsService))
    private eventLocationsService: PLEventLocationsService,
    private cacheService: CacheService,
    private teamService: TeamsService,
    private awsService: AwsService,
    @Inject(forwardRef(() => PLEventsService))
    private eventService: PLEventsService,
    @Inject(forwardRef(() => IrlGatheringPushCandidatesService))
    private readonly irlGatheringPushCandidatesService: IrlGatheringPushCandidatesService
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

      // 1) Normalize memberUid first
      data.memberUid = isAdmin ? data.memberUid : member.uid;

      // 2) Validate stay range (if provided)
      const checkInDate = data.additionalInfo?.checkInDate;
      const checkOutDate = data.additionalInfo?.checkOutDate;
      this.assertValidStayRange(checkInDate, checkOutDate);

      // 3) Prevent duplicates:
      // - if events are provided: block duplicates for the same (memberUid, locationUid, eventUid)
      // - if no events: block duplicates for the same (memberUid, locationUid) with overlapping stay range
      const requestedEventUids = (data.events ?? []).map((e) => e.uid).filter(Boolean);
      if (requestedEventUids.length > 0) {
        await this.assertNoDuplicateGuestForEvents({
          locationUid,
          memberUid: data.memberUid,
          eventUids: requestedEventUids,
          tx,
        });
      } else {
        if (type === CREATE) {
          await this.assertNoDuplicateGuestForLocationAndRange({
            locationUid,
            memberUid: data.memberUid,
            checkInDate,
            checkOutDate,
            tx,
          });
        }
      }

      // 4) Update member details (telegram/officeHours) once
      await this.updateMemberDetails(data, member, isAdmin, tx);

      // 5) Create guests rows
      const guests = this.formatInputToEventGuests(data, locationUid);

      const eventMember: Member = await this.memberService.findMemberByUid(data.memberUid);
      const plEvents: PLEvent[] = await this.getPLEventsByMemberAndLocation(eventMember, locationUid);

      const result = await (tx || this.prisma).pLEventGuest.createMany({ data: guests });

      if (type === CREATE) {
        await this.eventLocationsService.subscribeLocationByUid(locationUid, data.memberUid);
        this.memberService.checkIfAdminUser(member) &&
          !plEvents.length &&
          (await this.sendEventInvitationIfAdminAddsMember(eventMember, location));
      }

      await this.updateGuestTopicsAndReason(data, locationUid, member, eventType, tx);

      // Recompute candidates and refresh already-sent pushes ONLY for affected events
      await this.irlGatheringPushCandidatesService.refreshCandidatesForEventsAndUpdateNotifications(
        guests.map((g) => g.eventUid).filter(Boolean)
      );

      // If guest(s) were added at the location without eventUid, refresh only this location push
      if (guests.some((g) => !g.eventUid)) {
        await this.irlGatheringPushCandidatesService.refreshNotificationsForLocation(locationUid);
      }

      this.cacheService.reset({ service: 'PLEventGuest' });
      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  }

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
    if (!isIRLNotificationsEnabled()) return;
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
              memberUid: member?.uid,
            },
          },
        },
      });
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
      const events = type === 'upcoming' ? location.upcomingEvents : location.pastEvents;
      const windowEventUids = events.map(e => e.uid);

      const isAdmin = this.memberService.checkIfAdminUser(member);
      const targetMemberUid = isAdmin ? data.memberUid : member.uid;

      const result = await this.prisma.$transaction(async (tx) => {
        // 1) ALWAYS clear event-level rows in the window (this is the core fix)
        if (windowEventUids.length > 0) {
          await tx.pLEventGuest.deleteMany({
            where: {
              locationUid: location.uid,
              memberUid: targetMemberUid,
              eventUid: { in: windowEventUids },
            },
          });
        }

        // 2) If user cleared all events -> keep/update location-only row
        if (!data?.events?.length) {
          const updated = await tx.pLEventGuest.updateMany({
            where: {
              locationUid: location.uid,
              memberUid: targetMemberUid,
              eventUid: null,
            },
            data: {
              telegramId: data.telegramId || null,
              officeHours: data.officeHours || null,
              reason: data.reason || null,
              teamUid: data.teamUid,
              topics: data.topics || [],
              additionalInfo: data.additionalInfo ?? null,
            },
          });

          if (!updated?.count) {
            await tx.pLEventGuest.create({
              data: {
                memberUid: targetMemberUid,
                teamUid: data.teamUid,
                locationUid: location.uid,
                eventUid: null,
                telegramId: data.telegramId || null,
                officeHours: data.officeHours || null,
                reason: data.reason || null,
                topics: data.topics || [],
                additionalInfo: data.additionalInfo ?? null,
                isHost: false,
                isSpeaker: false,
                isSponsor: false,
              } as any,
            });
          }

          return updated;
        }

        // 3) events provided -> create new event-level rows (the new selection)
        return this.createPLEventGuestByLocation(
          data,
          member,
          location.uid,
          requestorEmail,
          location,
          UPDATE,
          tx,
          type
        );
      });

      // post-transaction effects
      if (!data?.events?.length) {
        await this.updateMemberDetails(data, member, isAdmin);
        await this.irlGatheringPushCandidatesService.refreshNotificationsForLocation(location.uid);
      } else {
        await this.irlGatheringPushCandidatesService.refreshCandidatesForEventsAndUpdateNotifications(windowEventUids);
      }

      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  }



  /**
   * Deletes PLEventGuest records for a SPECIFIC location only.
   *
   * Rules (scoped by locationUid):
   * 1) If `events` are provided (non-empty) for a member:
   *    - delete ONLY event-level guest rows for those eventUids within THIS location
   *    - keep location-only rows (eventUid = null) untouched
   *
   * 2) If `events` are missing or an empty array for a member:
   *    - treat as FULL delete for that member within THIS location
   *    - delete ALL guest rows for that member in THIS location only (event-level + location-only)
   *
   * After deletion:
   * - resets PLEventGuest cache
   * - refreshes push candidates/notifications for affected eventUids only (scoped to this location)
   *
   * @param locationUid Location UID from route (/v1/irl/locations/:locationUid/...)
   * @param membersAndEvents An array of objects containing { memberUid, events?: string[] }
   */
  async deletePLEventGuests(locationUid: string, membersAndEvents: Array<{ memberUid: string; events?: string[] }>) {
    try {
      const eventDeleteConditions: Array<{ memberUid: string; eventUid: string }> = [];
      const fullDeleteMemberUids: string[] = [];

      // Build delete intent
      for (const item of membersAndEvents ?? []) {
        const memberUid = item?.memberUid;
        const events = item?.events;

        if (!memberUid) continue;

        if (!Array.isArray(events) || events.length === 0) {
          fullDeleteMemberUids.push(memberUid);
          continue;
        }

        events.forEach((eventUid) => {
          const uid = typeof eventUid === 'string' ? eventUid.trim() : '';
          if (uid) eventDeleteConditions.push({ memberUid, eventUid: uid });
        });
      }

      // De-dup full deletes
      const uniqueFullDeleteMemberUids = Array.from(new Set(fullDeleteMemberUids));

      // De-dup event delete pairs
      const uniqueEventDeleteConditions: Array<{ memberUid: string; eventUid: string }> = [];
      const seenPairs = new Set<string>();
      for (const c of eventDeleteConditions) {
        const key = `${c.memberUid}::${c.eventUid}`;
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          uniqueEventDeleteConditions.push(c);
        }
      }

      // Collect affected eventUids for push refresh (scoped to this location)
      const affectedEventUidsSet = new Set<string>();

      uniqueEventDeleteConditions.forEach((d) => affectedEventUidsSet.add(d.eventUid));

      if (uniqueFullDeleteMemberUids.length > 0) {
        const existingEventRows = await this.prisma.pLEventGuest.findMany({
          where: {
            locationUid, // IMPORTANT: scope to this location only
            memberUid: { in: uniqueFullDeleteMemberUids },
            eventUid: { not: null },
          },
          select: { eventUid: true },
        });

        existingEventRows.forEach((r) => {
          if (r?.eventUid) affectedEventUidsSet.add(String(r.eventUid));
        });
      }

      const result = await this.prisma.$transaction(async (tx) => {
        const r: any = { events: { count: 0 }, full: { count: 0 } };

        // 1) Delete ONLY event-level rows (scoped to this location)
        if (uniqueEventDeleteConditions.length > 0) {
          r.events = await tx.pLEventGuest.deleteMany({
            where: {
              locationUid,
              OR: uniqueEventDeleteConditions,
            },
          });
        }

        // 2) Full delete for members with empty/missing events (ONLY within this location)
        if (uniqueFullDeleteMemberUids.length > 0) {
          r.full = await tx.pLEventGuest.deleteMany({
            where: {
              locationUid,
              memberUid: { in: uniqueFullDeleteMemberUids },
            },
          });
        }

        return r;
      });

      await this.cacheService.reset({ service: 'PLEventGuest' });

      const affectedEventUids = Array.from(affectedEventUidsSet).filter((x): x is string => x.length > 0);

      if (affectedEventUids.length > 0) {
        await this.irlGatheringPushCandidatesService.refreshCandidatesForEventsAndUpdateNotifications(affectedEventUids);
      }

      this.logger.info(
        `[PLEventGuestsService] deletePLEventGuests ` +
        JSON.stringify({
          locationUid,
          eventDeletePairs: uniqueEventDeleteConditions.length,
          fullDeleteMembers: uniqueFullDeleteMemberUids.length,
          affectedEventUids: affectedEventUids.length,
          deletedEventCount: result?.events?.count ?? 0,
          deletedFullCount: result?.full?.count ?? 0,
        })
      );

      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  }

  /**
   * This method retrieves event guests by location and type (upcoming or past events).
   * @param locationUid The unique identifier of the event location
   * @param query Optional query parameters, such as sorting and filtering
   * @param isUserLoggedIn Boolean indicating whether the user is logged in
   * @returns An array of event guests, with sensitive details filtered based on login status
   *   - Applies member preferences on displaying details like telegramId and office hours.
   *
   * include location-only guests (eventUid = null) in Attendees list
   * based on checkInDate/checkOutDate overlap with the events window.
   */
  async getPLEventGuestsByLocationAndType(locationUid: string, query, member) {
    try {
      let events: PLEvent[];
      const { type, filteredEvents } = query;

      if (type === 'upcoming') {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === 'past') {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }

      events = await this.filterEventsByAttendanceAndAdminStatus(filteredEvents, events, member);

      const window = this.getEventsWindow(events);

      // Detailed request log
      this.logger.info(
        `[PLEventGuestsService] getPLEventGuestsByLocationAndType request ` +
        JSON.stringify({
          locationUid,
          type: type ?? null,
          loggedInMemberUid: member?.uid ?? null,
          filteredEventsCount: Array.isArray(filteredEvents) ? filteredEvents.length : 0,
          eventsCountAfterFilter: Array.isArray(events) ? events.length : 0,
          page: query?.page ?? 1,
          limit: query?.limit ?? 10,
          sortBy: query?.sortBy ?? null,
          sortDirection: query?.sortDirection ?? null,
          search: query?.search ?? null,
          includeLocationOnlyGuests: true,
          windowStart: window?.start ?? null,
          windowEnd: window?.end ?? null,
        })
      );

      const result = await this.fetchAttendees({
        locationUid,
        eventUids: events?.map((event) => event.uid),
        windowStart: window?.start ?? null,
        windowEnd: window?.end ?? null,
        includeLocationOnlyGuests: true,
        ...query,
        loggedInMemberUid: member ? member?.uid : null,
      });

      this.restrictTelegramBasedOnMemberPreference(result, !!member);
      this.restrictOfficeHours(result, !!member);

      // Keep old UX safeguard (should become no-op once SQL ordering is correct)
      if (member?.uid && Array.isArray(result) && result.length > 1) {
        const idx = result.findIndex((g: any) => g?.memberUid === member.uid);
        if (idx > 0) {
          const [me] = result.splice(idx, 1);
          result.unshift(me);
        }
      }

      // Response log (page-level)
      this.logger.info(
        `[PLEventGuestsService] getPLEventGuestsByLocationAndType response ` +
        JSON.stringify({
          locationUid,
          type: type ?? null,
          loggedInMemberUid: member?.uid ?? null,
          returnedCount: Array.isArray(result) ? result.length : 0,
          firstMemberUid: Array.isArray(result) && result[0] ? result[0]?.memberUid ?? null : null,
        })
      );

      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  }

  /**
   * This method updates the member details such as Telegram ID and office hours based on the provided guest data.
   * @param guest The guest data object containing the updated details
   * @param member The member object to be updated
   * @param isAdmin Boolean indicating whether the current user is an admin
   *   - Admins can update other members' details, while non-admins can only update their own details.
   */
  async updateMemberDetails(guest: any, member: Member, isAdmin: boolean, tx?: Prisma.TransactionClient) {
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
  async getPLEventGuestsByLocation(locationUid: string, query: Prisma.PLEventGuestFindManyArgs) {
    try {
      const events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      return await this.prisma.pLEventGuest.findMany({
        where: {
          eventUid: {
            in: events.map((event) => event.uid),
          },
          member: {
            accessLevel: {
              notIn: ['L0', 'L1', 'Rejected'],
            },
          },
          ...query.where,
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
              endDate: true,
            },
          },
          team: {
            select: {
              uid: true,
              name: true,
            },
          },
          member: {
            select: {
              name: true,
              accessLevel: true,
              image: {
                select: {
                  url: true,
                },
              },
            },
          },
        },
        orderBy: query.orderBy,
      });
    } catch (err) {
      this.handleErrors(err);
    }
  }

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
  }

  /**
   * This method formats the input data to create event guests with the required details for each event.
   * @param input The input data containing details such as events, topics, telegram ID, office hours, etc.
   * @returns An array of formatted event guest objects to be inserted into the database.
   */
  private formatInputToEventGuests(input: CreatePLEventGuestSchemaDto, locationUid: string) {
    const events = input.events ?? [];
    if (events.length === 0) {
      // Location-level guest (IRL Gathering attendee without a specific event)
      return [
        {
          telegramId: input.telegramId || null,
          officeHours: input.officeHours || null,
          reason: input.reason || null,
          memberUid: input.memberUid,
          teamUid: input.teamUid,
          locationUid,
          eventUid: null,
          additionalInfo: input.additionalInfo ?? null,
          topics: input.topics || [],
          isHost: false,
          isSpeaker: false,
          isSponsor: false,
        },
      ];
    }

    return events.map((event) => {
      const additionalInfo = {
        ...input.additionalInfo,
        hostSubEvents: event.hostSubEvents || [],
        speakerSubEvents: event.speakerSubEvents || [],
        sponsorSubEvents: event.sponsorSubEvents || [],
      };
      return {
        telegramId: input.telegramId || null,
        officeHours: input.officeHours || null,
        reason: input.reason || null,
        memberUid: input.memberUid,
        teamUid: input.teamUid,
        locationUid,
        eventUid: event.uid,
        additionalInfo: additionalInfo,
        topics: input.topics || [],
        isHost: event.isHost || false,
        isSpeaker: event.isSpeaker || false,
        isSponsor: event.isSponsor || false,
      };
    });
  }

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
    } else if (!isUserLoggedIn && eventGuests) {
      eventGuests = eventGuests.map((guest: any) => {
        delete guest.member.telegramHandler;
        delete guest.telegramId;
        return guest;
      });
    }
    return eventGuests;
  }

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
  }

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
  }

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
      return events.filter((event) => filteredEventsUid?.includes(event.uid)).filter((event) => event.type !== 'INVITE_ONLY');
    }
    // If the user is logged out, remove all invite-only events
    if (!member) {
      return events.filter((event) => event.type !== 'INVITE_ONLY');
    }
    // If the user is an admin, return all events without filtering
    if (this.memberService.checkIfAdminUser(member)) {
      return filteredEventsUid?.length ? events.filter((event) => filteredEventsUid.includes(event.uid)) : events;
    }
    // Scenario 2: If the user is logged in and not an admin, get invite-only events they are attending
    const userAttendedEvents = await this.prisma.pLEvent.findMany({
      where: {
        type: 'INVITE_ONLY',
        eventGuests: {
          some: {
            memberUid: member.uid,
          },
        },
      },
      select: {
        uid: true,
      },
    });
    // Create a Set of attended invite-only event UIDs for efficient lookup
    const attendedEventUids = new Set(userAttendedEvents.map((event) => event.uid));
    // Filter events to keep non-invite-only events and attended invite-only events
    if (filteredEventsUid?.length > 0) {
      return events
        .filter((event) => filteredEventsUid?.includes(event.uid))
        .filter((event) => event.type !== 'INVITE_ONLY' || attendedEventUids.has(event?.uid));
    }
    return events.filter((event) => event.type !== 'INVITE_ONLY' || attendedEventUids.has(event.uid));
  }

  /**
   * Fetches event attendees with dynamic filtering, searching, sorting, and pagination.
   * Retrieves event, member, and team information for each attendee.
   *
   * fetchAttendees now returns BOTH
   * - event attendees (eventUid in eventUids)
   * - location-only attendees (eventUid IS NULL) filtered by stay overlap with events window (if window present)
   */
  async fetchAttendees(queryParams) {
    const {
      locationUid,
      includeLocationOnlyGuests = false,

      eventUids,
      isHost,
      isSpeaker,
      isSponsor,
      topics,
      sortBy,
      sortDirection = 'asc',
      search,
      limit = 10,
      page = 1,
      loggedInMemberUid,
      includeLocations,
    } = queryParams;

    this.logger.info(
      `[PLEventGuestsService] fetchAttendees input ` +
      JSON.stringify({
        locationUid: locationUid ?? null,
        loggedInMemberUid: loggedInMemberUid ?? null,
        includeLocationOnlyGuests: !!includeLocationOnlyGuests,
        eventUidsCount: Array.isArray(eventUids) ? eventUids.length : 0,
        topicsCount: Array.isArray(topics) ? topics.length : 0,
        isHost: isHost ?? null,
        isSpeaker: isSpeaker ?? null,
        isSponsor: isSponsor ?? null,
        sortBy: sortBy ?? null,
        sortDirection: sortDirection ?? null,
        search: search ?? null,
        limit: limit ?? 10,
        page: page ?? 1,
        includeLocations: !!includeLocations,
      })
    );

    // Build dynamic query conditions for filtering by eventUids and topics
    let { conditions, values } = this.buildConditions(eventUids, topics);

    // location filter (always)
    values.push(locationUid);
    const locationUidPos = values.length;
    // bind loggedInMemberUid for outer ORDER BY (so it works before pagination)
    values.push(loggedInMemberUid ?? null);
    const loggedInUidPos = values.length;

    // IMPORTANT:
    // Bind eventUids now as a fixed placeholder so search (applySearch) can't shift it.
    values.push(eventUids);
    const eventUidsPos = values.length;

    // Apply sorting based on the sortBy parameter (default is sorting by memberName)
    const orderBy = this.applySorting(sortBy, sortDirection, loggedInMemberUid);

    // Apply pagination to limit the results and calculate the offset for the current page
    const { limit: paginationLimit, offset } = this.applyPagination(Number(limit), page);

    const selectLocation = includeLocations ? `,'location', l."location"` : ``; // Empty if location is not required

    const query: any = `
      WITH event_attendees AS (
        SELECT
          *,
          COUNT(*) OVER() AS count
      FROM (
        SELECT
        pg."memberUid",
        CASE
        WHEN BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventUidsPos}))
        THEN 'isHostOnly'
        WHEN BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventUidsPos}))
        THEN 'isSpeakerOnly'
        WHEN BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND NOT BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventUidsPos}))
        THEN 'isSponsorOnly'
        WHEN BOOL_OR(pg."isHost" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND BOOL_OR(pg."isSpeaker" AND pg."eventUid" = ANY($${eventUidsPos}))
        AND BOOL_OR(pg."isSponsor" AND pg."eventUid" = ANY($${eventUidsPos}))
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

        COALESCE(
        json_agg(
        DISTINCT jsonb_build_object(
        'uid', e.uid,
        'slugURL', e."slugURL",
        'name', e.name,
        'type', e.type,
        'startDate', e."startDate",
        'endDate', e."endDate",
        'isHost', pg."isHost",
        'isSpeaker', pg."isSpeaker",
        'isSponsor', pg."isSponsor",
        'additionalInfo', pg."additionalInfo"
        ${selectLocation}
        )
        ) FILTER (WHERE e.uid = ANY($${eventUidsPos})),
        '[]'::json
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

        COALESCE(
        jsonb_agg(
        DISTINCT jsonb_build_object(
        'role', tmr."role",
        'team', jsonb_build_object(
        'uid', tmr_team.uid,
        'name', tmr_team.name,
        'logo', jsonb_build_object('url', tmr_logo.url)
        )
        )
        ) FILTER (WHERE tmr_team.uid IS NOT NULL),
        '[]'::jsonb
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
        AND ($${locationUidPos}::text IS NULL OR pg."locationUid" = $${locationUidPos})

        GROUP BY
        pg."memberUid",
        pg."teamUid",
        pg."topics",
        pg."reason",
        m.name,
        tm.name
        ${conditions}
        ${orderBy}
        ) AS subquery
        ${this.buildHostAndSpeakerCondition(isHost, isSpeaker, isSponsor)}
        ),

        location_only AS (
        ${includeLocationOnlyGuests
        ? `
                  SELECT
                    pg."memberUid",
                    'none' AS guest_type,
                    json_object_agg(
                        'info',
                        json_build_object(
                            'reason', pg."reason",
                            'teamUid', pg."teamUid",
                            'topics', pg."topics",
                            'isHost', false,
                            'isSpeaker', false,
                            'isSponsor', false,
                            'createdAt', pg."createdAt",
                            'telegramId', pg."telegramId",
                            'officeHours', pg."officeHours",
                            'additionalInfo', pg."additionalInfo"
                        )
                    ) AS guest,
                    '[]'::json AS events,
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
                    COALESCE(
                        jsonb_agg(
                          DISTINCT jsonb_build_object(
                'role', tmr."role",
                'team', jsonb_build_object(
                  'uid', tmr_team.uid,
                  'name', tmr_team.name,
                  'logo', jsonb_build_object('url', tmr_logo.url)
                )
              )
            ) FILTER (WHERE tmr_team.uid IS NOT NULL),
                        '[]'::jsonb
                    ) AS teamMemberRoles,
                    json_object_agg(
                        'team',
                        json_build_object(
                            'uid', tm.uid,
                            'name', tm.name,
                            'logo', json_build_object('url', tml.url)
                        )
                    ) AS team,
                    0::bigint AS count
                  FROM "PLEventGuest" pg
                    JOIN "Member" m ON m.uid = pg."memberUid"
                    LEFT JOIN "Image" mi ON mi.uid = m."imageUid"
                    LEFT JOIN "TeamMemberRole" tmr ON tmr."memberUid" = m.uid
                    LEFT JOIN "Team" tmr_team ON tmr_team.uid = tmr."teamUid"
                    LEFT JOIN "Image" tmr_logo ON tmr_logo.uid = tmr_team."logoUid"
                    LEFT JOIN "Team" tm ON tm.uid = pg."teamUid"
                    LEFT JOIN "Image" tml ON tml.uid = tm."logoUid"
                  WHERE
                    ($${locationUidPos}::text IS NULL OR pg."locationUid" = $${locationUidPos})
                    AND pg."eventUid" IS NULL
                    AND m."accessLevel" NOT IN ('L0','L1','Rejected')

                    -- prevent duplicates: if member already attends at least one of the requested events,
                    -- don't include their location-only row
                    AND NOT EXISTS (
                    SELECT 1
                    FROM "PLEventGuest" pg2
                    WHERE
                    pg2."locationUid" = pg."locationUid"
                    AND pg2."memberUid" = pg."memberUid"
                    AND pg2."eventUid" = ANY($${eventUidsPos})
                    )
                  GROUP BY
                    pg."memberUid",
                    pg."teamUid",
                    pg."topics",
                    pg."reason",
                    m.name,
                    tm.name
                `
        : `SELECT NULL::text AS "memberUid", 'none'::text AS guest_type, '{}'::json AS guest, '[]'::json AS events, '{}'::json AS member, '[]'::jsonb AS teamMemberRoles, '{}'::json AS team, 0::bigint AS count WHERE FALSE`
      }
        ),

        combined AS (
      SELECT * FROM event_attendees
      UNION ALL
      SELECT * FROM location_only
        )

      SELECT
        *,
        COUNT(*) OVER() AS count
      FROM combined
        ${this.buildHostAndSpeakerCondition(isHost, isSpeaker, isSponsor)}
        ${this.buildOuterOrderBy(sortBy, sortDirection, loggedInUidPos)}
        LIMIT $${values.length + 1}
      OFFSET $${values.length + 2}
    `;

    this.logger.info(
      `[PLEventGuestsService] fetchAttendees sqlMeta ` +
      JSON.stringify({
        valuesCountBeforePagination: values.length,
        locationUidPos,
        loggedInUidPos,
        eventUidsPos,
        paginationLimit,
        offset,
      })
    );

    values.push(paginationLimit, offset);

    this.logger.info(
      `[PLEventGuestsService] fetchAttendees sqlParams ` +
      JSON.stringify({
        valuesCountFinal: values.length,
        eventUidsCount: Array.isArray(eventUids) ? eventUids.length : 0,
        hasSearch: !!search,
        hasLoggedInUid: !!loggedInMemberUid,
      })
    );

    // Execute the raw query with the built query string and values
    const result = await this.prisma.$queryRawUnsafe(query, ...values);
    return this.formatAttendees(result);
  }


  private buildOuterOrderBy(sortBy: string, sortDirection: any, loggedInUidPos: number): string {
    const normalizeString = (v: any): string => {
      if (Array.isArray(v)) {
        // take last non-empty item if present, otherwise last item
        const lastNonEmpty = [...v].reverse().find((x) => typeof x === 'string' && x.trim().length > 0);
        return (lastNonEmpty ?? v[v.length - 1] ?? '').toString();
      }
      if (v === undefined || v === null) return '';
      return String(v);
    };

    const normalizedSortBy = normalizeString(sortBy).trim();
    const normalizedSortDirection = normalizeString(sortDirection).trim().toLowerCase();
    const dir = normalizedSortDirection === 'desc' ? 'desc' : 'asc';

    const loggedInFirst = `CASE WHEN $${loggedInUidPos}::text IS NOT NULL AND "memberUid" = $${loggedInUidPos} THEN 0 ELSE 1 END`;

    const memberNameExpr = `("member"->'member'->>'name')`;
    const teamNameExpr = `("team"->'team'->>'name')`;

    if (normalizedSortBy === 'member') {
      return `
      ORDER BY
        ${loggedInFirst},
        ${memberNameExpr} ${dir}
    `;
    }

    if (normalizedSortBy === 'team') {
      return `
      ORDER BY
        ${loggedInFirst},
        ${teamNameExpr} ${dir} NULLS LAST,
        ${memberNameExpr} asc
    `;
    }

    // Default ordering (preserve previous intent: completeness first, then name)
    const hasReasonAndTopics = `(("guest"->'info'->>'reason') IS NOT NULL AND jsonb_typeof(("guest"->'info'->'topics')::jsonb) = 'array' AND jsonb_array_length(("guest"->'info'->'topics')::jsonb) > 0)`;
    const hasTopics = `(jsonb_typeof(("guest"->'info'->'topics')::jsonb) = 'array' AND jsonb_array_length(("guest"->'info'->'topics')::jsonb) > 0)`;
    const hasReason = `(("guest"->'info'->>'reason') IS NOT NULL)`;

    return `
    ORDER BY
      ${loggedInFirst},
      CASE
        WHEN ${hasReasonAndTopics} THEN 1
        WHEN ${hasTopics} THEN 2
        WHEN ${hasReason} THEN 3
        ELSE 4
      END asc,
      ${memberNameExpr} ${dir}
  `;
  }


  /**
   *
   * @param includeLocation query param to specify whether to include location or not
   * @returns join query for event location is specified
   */
  private joinEventLocations(includeLocation: boolean) {
    if (includeLocation) {
      return `LEFT JOIN "PLEventLocation" l ON l.uid = e."locationUid"`;
    }
    return '';
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
      guestInfo.teamUid = this.getGuestsActiveTeam(attendee?.teammemberroles, guestInfo?.teamUid)
        ? guestInfo?.teamUid
        : null;
      return {
        // Total count of members after filtering, represented by totalMembers
        count: Number(BigInt(attendee.count || '0n')),

        memberUid: attendee.memberUid,
        // Spread guest information if available, including attributes like isHost, isSpeaker and isSponsor
        ...guestInfo,
        events: attendee.events,
        member: {
          ...attendee?.member?.member,
          teamMemberRoles: attendee?.teammemberroles,
        },
        team: this.getGuestsActiveTeam(attendee?.teammemberroles, attendee?.team?.team) ? attendee?.team?.team : {},
      };
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
      conditions.push(`ARRAY[${eventUids?.map((_, i) => `$${i + 1}`).join(', ')}] && array_agg(e.uid)`);
      values.push(...eventUids);
    }
    // Add a condition for topics if provided, using the overlap operator (&&)
    if (topics && topics.length > 0) {
      conditions.push(`pg."topics" && $${values.length + 1}`);
      values.push(topics);
    }
    // Combine conditions into a single WHERE clause if any conditions are present
    const conditionsString = conditions.length > 0 ? ` Having ${conditions.join(' AND ')} ` : '';
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
    if (isHost === 'true' && isSpeaker === 'true' && isSponsor === 'true') {
      return ` WHERE guest_type = 'hostAndSpeakerAndSponsor' `; // Return condition for both host, speaker and sponsor
    }
    // Check if the guest is only a host
    else if (isHost === 'true') {
      return ` WHERE guest_type = 'isHostOnly' `; // Return condition for host only
    }
    // Check if the guest is only a speaker
    else if (isSpeaker === 'true') {
      return ` WHERE guest_type = 'isSpeakerOnly' `; // Return condition for speaker only
    }
    // Check if the guest is only a sponsor
    else if (isSponsor === 'true') {
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
        (m."accessLevel" NOT IN ('L0', 'L1', 'Rejected') AND (m."name" ILIKE $${values.length}) OR
        tm."name" ILIKE $${values.length} OR
        pc_project."name" ILIKE $${values.length} OR
        cp."name" ILIKE $${values.length}) `;
      // Append search term to the query values with wildcard matching
    }
    return ` WHERE m."accessLevel" NOT IN ('L0', 'L1', 'Rejected')`;
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
      case 'member':
        return 'ORDER BY m."name" ' + sortDirection;
      case 'team':
        return 'ORDER BY tm."name" ' + sortDirection;
      default:
        const loggedInMemberOrder = uid ? `CASE WHEN pg."memberUid" = '${uid}' THEN 0 ELSE 1 END,` : '';
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
        `;
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
      if (type === 'upcoming') {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === 'past') {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }
      let uniqueTopics = await this.prisma.pLEventGuest.findMany({
        where: {
          eventUid: {
            in: events.map((event) => event.uid),
          },
        },
        select: {
          topics: true,
        },
      });
      return Array.from(new Set(uniqueTopics.flatMap((guest) => guest.topics)));
    } catch (err) {
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
  async getPLEventGuestByUidAndLocation(memberUid: string, locationUid: string, isUserLoggedIn: boolean, type: string) {
    try {
      let events;
      if (type === 'upcoming') {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else if (type === 'past') {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);
      } else {
        events = (await this.eventLocationsService.getPLEventLocationByUid(locationUid)).events;
      }
      const result = await this.prisma.pLEventGuest.findMany({
        where: {
          memberUid,
          eventUid: {
            in: events.map((event) => event.uid),
          },
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
              additionalInfo: true,
            },
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
                      logo: { select: { url: true } },
                    },
                  },
                },
              },
            },
          },
          team: {
            select: {
              uid: true,
              name: true,
              logo: { select: { url: true } },
            },
          },
          createdAt: true,
          telegramId: isUserLoggedIn ? true : false,
          officeHours: isUserLoggedIn ? true : false,
        },
      });
      this.restrictTelegramBasedOnMemberPreference(result, isUserLoggedIn ? true : false);
      const formattedResult = await result.map((guest) => {
        return {
          ...guest,
          teamUid: this.getGuestsActiveTeam(guest.member.teamMemberRoles, guest.teamUid) ? guest.teamUid : null,
          team: this.getGuestsActiveTeam(guest.member.teamMemberRoles, guest.team) ? guest.team : {}, // Update team object
        };
      });
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
    if (searchBy === 'member') {
      return {
        member: {
          name: {
            startsWith: searchText,
            mode: 'insensitive',
          },
        },
      };
    } else if (searchBy === 'team') {
      return {
        team: {
          name: {
            startsWith: searchText,
            mode: 'insensitive',
          },
        },
      };
    } else {
      return {};
    }
  }

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
            eventUid: eventUid,
          },
        },
        include: {
          member: {
            select: {
              name: true,
              bio: true,
            },
          },
          event: {
            select: {
              name: true,
              startDate: true,
              location: {
                select: {
                  location: true,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  async getAllPLEventGuest() {
    const rows = await this.fetchAttendees({
      locationUid: null,
      eventUids: [],
      isHost: undefined,
      isSpeaker: undefined,
      isSponsor: undefined,
      topics: [],
      sortBy: 'memberName',
      sortDirection: 'asc',
      search: '',
      limit: Number.MAX_SAFE_INTEGER, // Disable pagination
      page: 1,
      loggedInMemberUid: null,
      includeLocations: true,
      includeLocationOnlyGuests: false,
      windowStart: null,
      windowEnd: null,
    });

    return await this.attachRoleFlags(rows, { locationUid: null, eventUids: [] });
  }

  private async attachRoleFlags(
    attendees: any[],
    scope: { locationUid?: string | null; eventUids?: string[] }
  ) {
    const memberUids = Array.from(new Set((attendees ?? []).map((x) => x?.memberUid).filter(Boolean)));
    if (memberUids.length === 0) return attendees ?? [];

    const safeEventUids = Array.isArray(scope?.eventUids) ? scope.eventUids.filter(Boolean) : [];
    const hasEventFilter = safeEventUids.length > 0;

    const rows: Array<{ memberUid: string; isHost: boolean; isSpeaker: boolean; isSponsor: boolean }> =
      await this.prisma.$queryRawUnsafe(
        `
      SELECT
        pg."memberUid" AS "memberUid",
        BOOL_OR(pg."isHost")    AS "isHost",
        BOOL_OR(pg."isSpeaker") AS "isSpeaker",
        BOOL_OR(pg."isSponsor") AS "isSponsor"
      FROM "PLEventGuest" pg
      WHERE pg."memberUid" = ANY($1::text[])
        AND ($2::text IS NULL OR pg."locationUid" = $2::text)
        AND (
          $3::boolean = false
          OR (pg."eventUid" IS NOT NULL AND pg."eventUid" = ANY($4::text[]))
        )
      GROUP BY pg."memberUid"
      `,
        memberUids,
        scope?.locationUid ?? null,
        hasEventFilter,
        safeEventUids
      );

    const map = new Map<string, { isHost: boolean; isSpeaker: boolean; isSponsor: boolean }>();
    for (const r of rows) {
      map.set(r.memberUid, {
        isHost: !!r.isHost,
        isSpeaker: !!r.isSpeaker,
        isSponsor: !!r.isSponsor,
      });
    }

    return (attendees ?? []).map((a) => {
      const f = map.get(a.memberUid) ?? { isHost: false, isSpeaker: false, isSponsor: false };
      return {
        ...a,
        isHost: f.isHost,
        isSpeaker: f.isSpeaker,
        isSponsor: f.isSponsor,
      };
    });
  }


  /**
   * Determines the active team for a guest.
   * @param teamMemberRoles - List of roles the guest has in different teams.
   * @param team - The current team associated with the guest.
   * @returns The team object if the guest is part of the team, otherwise an empty object.
   */
  private getGuestsActiveTeam(teamMemberRoles, team: Partial<Team> | string | null): Boolean {
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
    type: string = 'upcoming',
    tx?: Prisma.TransactionClient
  ) {
    const location = await this.eventLocationsService.getPLEventLocationByUid(locationUid);
    const events = type === 'upcoming' ? location.pastEvents : location.upcomingEvents;
    const isAdmin = this.memberService.checkIfAdminUser(member);
    return await (tx || this.prisma).pLEventGuest.updateMany({
      where: {
        memberUid: isAdmin ? data.memberUid : member.uid,
        eventUid: {
          in: events.map((event) => event.uid),
        },
      },
      data: {
        topics: data.topics,
        reason: data.reason,
        teamUid: data.teamUid,
        officeHours: data.officeHours,
      },
    });
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
      const eventUids = location.events.flatMap((event) => event.uid);
      const result = await this.prisma.pLEventGuest.findFirst({
        where: {
          AND: {
            eventUid: {
              in: eventUids,
            },
            memberUid: guestUid,
          },
        },
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          topics: true,
          reason: true,
        },
      });
      if (!result) {
        return [];
      }
      return result;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * This method retrieves all aggregated event and location data with optional search functionality.
   * @param loggedInMember The logged in member object
   * @param searchParams Optional search parameters including name and isAggregated for filtering
   * @returns An object containing:
   * - `events`: An array of event objects filtered by search and aggregation status if provided.
   * - `locations`: An array of location objects filtered by search and aggregation status if provided.
   * @throws an `InternalServerErrorException` if an error occurs during data retrieval.
   */
  async getAllAggregatedData(loggedInMember, queryParams) {
    try {
      // Build search conditions for events and locations
      const eventSearchCondition = queryParams?.name
        ? {
          name: {
            contains: queryParams.name,
            mode: 'insensitive' as const,
          },
        }
        : {};

      const locationSearchCondition = queryParams?.name
        ? {
          location: {
            contains: queryParams.name,
            mode: 'insensitive' as const,
          },
        }
        : {};

      // Build orderBy conditions based on queryParams.orderBy
      const eventOrderBy = (await this.buildOrderByCondition(queryParams?.orderBy)) || { aggregatedPriority: 'desc' };
      const locationOrderBy = (await this.buildOrderByCondition(queryParams?.orderBy)) || {
        aggregatedPriority: 'desc',
      };

      return {
        events: await this.eventService.getPLEvents({
          where: {
            isAggregated: queryParams.isAggregated !== undefined ? queryParams.isAggregated === 'true' : true,
            ...eventSearchCondition,
          },
          ...(eventOrderBy && { orderBy: eventOrderBy }),
        }),

        locations: await this.eventLocationsService.getFeaturedLocationsWithSubscribers(
          {
            where: {
              isAggregated: queryParams.isAggregated !== undefined ? queryParams.isAggregated === 'true' : true,
              ...locationSearchCondition,
            },
            ...(locationOrderBy && { orderBy: locationOrderBy as any }),
          },
          loggedInMember
        ),
      };
    } catch (error) {
      this.logger.error(`Error occured while retrieving aggregated data: ${error}`);
      this.handleErrors(error);
    }
  }

  private buildOrderByCondition(orderBy?: string) {
    if (!orderBy) return null;

    // Handle descending order (prefixed with -)
    if (orderBy.startsWith('-')) {
      const field = orderBy.substring(1);
      return { [field]: 'desc' };
    }

    // Handle ascending order (default)
    return { [orderBy]: 'asc' };
  }

  enrichEvents(events) {
    return events.map((event) => ({
      ...event,
      rowspan:
        (event.hostSubEvents?.length || 0) +
        (event.speakerSubEvents?.length || 0) +
        (event.sponsorSubEvents?.length || 0),
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
      };
      if (body.teamUid) {
        const team = await this.teamService.findTeamByUid(body.teamUid);
        if (!team) {
          throw new NotFoundException('Team not found');
        }
        emailData['teamName'] = team.name;
      } else {
        emailData['teamName'] = '';
      }

      const adminEmailIdsEnv = process.env.SES_ADMIN_EMAIL_IDS;
      const adminEmailIds = adminEmailIdsEnv?.split('|') ?? [];

      const result = await this.awsService.sendEmailWithTemplate(
        path.join(__dirname, '/shared/markMyPresence.hbs'),
        {
          ...emailData,
        },
        '',
        'Request to Log Attendance for Past In-Person Events',
        process.env.SES_SOURCE_EMAIL || '',
        adminEmailIds,
        []
      );
      this.logger.info(
        `New mark my presence request for ${userEmail} notified to support team ref: ${result?.MessageId}`
      );

      //const response = await this.awsService.sendEmail(EVENT_GUEST_PRESENCE_REQUEST_TEMPLATE_NAME, true, [], emailData);
      return {
        message: 'Email sent successfully',
      };
    } catch (error) {
      return this.handleErrors(error);
    }
  }

  // ===========================
  // helpers for stay overlap + duplicates
  // ===========================

  private parseYmdToUtcDate(v?: string): Date | null {
    if (!v || typeof v !== 'string') return null;
    const s = v.trim();
    if (!s) return null;

    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (!m) return null;

    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);

    const dt = new Date(Date.UTC(y, mo, d));
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  private overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
    return aStart.getTime() <= bEnd.getTime() && aEnd.getTime() >= bStart.getTime();
  }

  private assertValidStayRange(checkInDate?: string, checkOutDate?: string) {
    const inRaw = (checkInDate ?? '').trim();
    const outRaw = (checkOutDate ?? '').trim();

    const hasIn = inRaw.length > 0;
    const hasOut = outRaw.length > 0;

    if (!hasIn && !hasOut) return;

    if (hasIn !== hasOut) {
      throw new BadRequestException('Both additionalInfo.checkInDate and additionalInfo.checkOutDate are required');
    }

    const inDt = this.parseYmdToUtcDate(inRaw);
    const outDt = this.parseYmdToUtcDate(outRaw);

    if (!inDt || !outDt) {
      throw new BadRequestException('checkInDate/checkOutDate must be in YYYY-MM-DD format');
    }

    if (inDt.getTime() > outDt.getTime()) {
      throw new BadRequestException('checkInDate must be <= checkOutDate');
    }
  }

  private async assertNoDuplicateGuestForEvents(params: {
    locationUid: string;
    memberUid: string;
    eventUids: string[];
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const prisma = params.tx || this.prisma;
    const eventUids = [...new Set((params.eventUids ?? []).filter(Boolean))];
    if (!eventUids.length) return;

    const existing = await prisma.pLEventGuest.findFirst({
      where: {
        locationUid: params.locationUid,
        memberUid: params.memberUid,
        eventUid: { in: eventUids },
      },
      select: { uid: true, eventUid: true },
    });

    if (existing) {
      throw new ConflictException(
        `Guest already exists for this location and event (memberUid=${params.memberUid}, locationUid=${params.locationUid}, eventUid=${existing.eventUid})`
      );
    }
  }

  private async assertNoDuplicateGuestForLocationAndRange(params: {
    locationUid: string;
    memberUid: string;
    checkInDate?: string;
    checkOutDate?: string;
    tx?: Prisma.TransactionClient;
  }): Promise<void> {
    const { locationUid, memberUid } = params;
    const prisma = params.tx || this.prisma;

    // New rule: only one location-only guest row per (memberUid, locationUid)
    // (event-level rows are allowed and do not block location-only creation)
    const existing = await prisma.pLEventGuest.findFirst({
      where: { locationUid, memberUid, eventUid: null },
      select: { uid: true },
    });

    if (existing) {
      throw new ConflictException(
        `Guest already exists for this location (memberUid=${memberUid}, locationUid=${locationUid}).`
      );
    }
  }

  // helper for event window
  private getEventsWindow(events: Array<{ startDate: any; endDate: any }>) {
    if (!events?.length) return null;
    const starts = events.map((e) => new Date(e.startDate).getTime()).filter((x) => !Number.isNaN(x));
    const ends = events.map((e) => new Date(e.endDate).getTime()).filter((x) => !Number.isNaN(x));
    if (!starts.length || !ends.length) return null;

    const minStart = Math.min(...starts);
    const maxEnd = Math.max(...ends);
    return {
      start: new Date(minStart).toISOString(),
      end: new Date(maxEnd).toISOString(),
    };
  }
}

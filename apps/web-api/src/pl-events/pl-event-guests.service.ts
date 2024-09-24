import { Injectable, NotFoundException, ConflictException, BadRequestException, Inject, CACHE_MANAGER } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma, Member } from '@prisma/client';
import { MembersService } from '../members/members.service';
import { Cache } from 'cache-manager';
import { PLEventLocationsService } from './pl-event-locations.service';
import {
  CreatePLEventGuestSchemaDto,
  UpdatePLEventGuestSchemaDto
} from 'libs/contracts/src/schema';
import { 
  FormattedLocationWithEvents,
  PLEvent 
} from './pl-event-locations.types';

@Injectable()
export class PLEventGuestsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private memberService: MembersService,
    private eventLocationsService: PLEventLocationsService,
    @Inject(CACHE_MANAGER) private cacheService: Cache
  ) {}

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
    tx?: Prisma.TransactionClient
  ) {
    try {
      const isAdmin = this.memberService.checkIfAdminUser(member);
      await this.updateMemberDetails(data, member, isAdmin, tx);
      data.memberUid = isAdmin ? data.memberUid : member.uid;
      const guests = this.formatInputToEventGuests(data);
      const result = await (tx || this.prisma).pLEventGuest.createMany({ data: guests });
      await this.cacheService.reset();
      return result;
    } catch(err) {
      this.handleErrors(err);
    }
  };

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
    member: Member
  ) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const isAdmin = this.memberService.checkIfAdminUser(member);
        await tx.pLEventGuest.deleteMany({
          where: {
            memberUid: isAdmin ? data.memberUid : member.uid,
            eventUid: {
              in: location.upcomingEvents.map(event => event.uid)
            }
          }
        });
        return await this.createPLEventGuestByLocation(data, member, tx);
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
      await this.cacheService.reset();
      return result;
    } catch (err) {
      this.handleErrors(err);
    }
  };

  /**
   * This method retrieves event guests by location and type (upcoming or past events).
   * @param locationUid The unique identifier of the event location
   * @param type The type of events to filter by (either "upcoming" or "past")
   * @param isUserLoggedIn Boolean indicating whether the user is logged in
   * @returns An array of event guests, with sensitive details filtered based on login status
   *   - Applies member preferences on displaying details like telegramId and office hours.
   */
  async getPLEventGuestsByLocationAndType(
    locationUid: string,
    type: string, 
    isUserLoggedIn: boolean
  ) {
    try {
      let events;
      if (type === "upcoming") {
        events = await this.eventLocationsService.getUpcomingEventsByLocation(locationUid);
      } else {
        events = await this.eventLocationsService.getPastEventsByLocation(locationUid);  
      }
      const result = await this.prisma.pLEventGuest.findMany({
        where: {
          eventUid: {
            in: events.map(event => event.uid)
          }
        },
        include: isUserLoggedIn ? {
          event: {
            include: {
              logo: true
            }
          },
          member: {
            include:{
              image: true,
              teamMemberRoles: {
                select:{
                  team: {
                    select:{
                      uid: true,
                      name: true,
                      logo: true
                    }
                  }
                }
              },
              projectContributions: {
                select:{
                  project:{
                    select:{
                      name: true,
                      isDeleted: true
                    }
                  }
                }
              },
              createdProjects:{
                select: {
                  name: true,
                  isDeleted: true
                }
              }
            }
          },
          team: {
            select:{
              uid: true,
              name: true,
              logo: true
            }
          }
        }:
        {
          team: {
            select:{
              name: true,
              logo: true
            }
          }
        }
      });
      this.restrictTelegramBasedOnMemberPreference(result, isUserLoggedIn);
      this.restrictOfficeHours(result, isUserLoggedIn);
      return result;
    }
    catch(err) {
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
        speakerSubEvents: event.speakerSubEvents || []
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
        isSpeaker: event.isSpeaker || false
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
      eventGuests = eventGuests.map((guest:any) => {
        if (!guest.telegramId) {
          delete guest.member.telegramHandler;
          return guest; 
        }
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
      eventGuests = eventGuests.map((guest:any) => {
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
}

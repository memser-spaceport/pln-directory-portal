import { Injectable, BadRequestException, ConflictException, NotFoundException, Inject, CACHE_MANAGER } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { Cache } from 'cache-manager';
import { MembersService } from '../members/members.service';


@Injectable()
export class PLEventsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private memberService: MembersService,
    @Inject(CACHE_MANAGER) private cacheService: Cache
  ) {}

  async getPLEvents(queryOptions: Prisma.PLEventFindManyArgs) {
    return await this.prisma.pLEvent.findMany({
      ...queryOptions,
      include: {
        logo: true,
        banner: true,
        eventGuests: {
          select:{
            eventUid: true
          }
        }
      }
    });
  };

  async getPLEventBySlug(
    slug: string,
    isUserLoggedIn: Boolean
  ) {
    const plEvent = await this.prisma.pLEvent.findUnique({
      where: { slugURL: slug },
      include: {
        logo: true,
        banner: true,
        eventGuests: {
          select: isUserLoggedIn ? {
            uid: true,
            reason: true,
            telegramId: true,
            memberUid: true,
            topics: true,
            officeHours: true,
            additionalInfo: true,
            member: {
              select:{
                name: true,
                image: true,
                telegramHandler: true,
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
                preferences: true,
                officeHours: true,
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
            teamUid: true,
            team: {
              select:{
                uid: true,
                name: true,
                logo: true
              }
            },
            createdAt: true,
          }:
          {
            teamUid: true,
            team: {
              select:{
                name: true,
                logo: true
              }
            },
            createdAt: true
          }
        }
      }
    });
    this.filterPrivateResources(plEvent, isUserLoggedIn);
    this.restrictTelegramBasedOnMemberPreference(plEvent, isUserLoggedIn);
    this.restrictOfficeHours(plEvent, isUserLoggedIn);
    return plEvent;
  };

  filterPrivateResources(plEvent, isUserLoggedIn) {
    if (plEvent?.resources && plEvent?.resources.length && !isUserLoggedIn) {
      plEvent.resources = plEvent?.resources.filter((resource:any) => { 
        return !resource.isPrivate
      });
    }
    return plEvent;
  }

  restrictTelegramBasedOnMemberPreference(plEvent, isUserLoggedIn) {
    if (isUserLoggedIn && plEvent?.eventGuests) {
      plEvent.eventGuests = plEvent.eventGuests.map((guest:any) => {
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
    return plEvent;
  }

  restrictOfficeHours(plEvent, isUserLoggedIn) {
    if (plEvent?.eventGuests && isUserLoggedIn) {
      plEvent.eventGuests = plEvent.eventGuests.map((guest:any) => {
        if (!guest.officeHours) {
          delete guest.member.officeHours;
        }
        return guest;
      });
    }
    return plEvent;
  }

  async createPLEventGuest(
    guest: Prisma.PLEventGuestUncheckedCreateInput,
    slug: string,
    member
  ) {
    try {  
      const event: any = await this.getPLEventBySlug(slug, true); 
      const isAdmin = this.memberService.checkIfAdminUser(member);
      await this.updateMemberDetails(guest, member, isAdmin);
      await this.prisma.pLEventGuest.create({
        data:{
          ...guest,
          memberUid: isAdmin ? guest.memberUid : member.uid,
          eventUid: event?.uid
        }
      });
      await this.cacheService.reset();
      return {
        msg: "success"
      };  
    } catch(err) {
      this.handleErrors(err);
    }
  };

  async modifyPLEventGuestByUid(
    uid: string, 
    guest: Prisma.PLEventGuestUncheckedCreateInput,
    slug: string,
    member
  ) {
    try {  
      const event: any = await this.getPLEventBySlug(slug, true); 
      const isAdmin = this.memberService.checkIfAdminUser(member);
      await this.updateMemberDetails(guest, member, isAdmin);
      return await this.prisma.pLEventGuest.update({
        where:{ uid },
        data:{
          ...guest,
          memberUid: this.memberService.checkIfAdminUser(member) ? guest.memberUid : member.uid,
          eventUid: event?.uid
        }
      });  
    } catch(err) {
      this.handleErrors(err);
    }
  };

  async deletePLEventGuests(
    guestUids,
  ) {
    try { 
      await this.prisma.pLEventGuest.deleteMany({
        where: { 
         uid: {
          in: guestUids ? guestUids : []
         }
        }
      });
      await this.cacheService.reset();
      return {
        msg: `success`
      };   
    } catch(err) {
      this.handleErrors(err);
    }
  }

  async getPLEventsByMember(member) {
    try {
      return this.prisma.pLEvent.findMany({
        where: {
          eventGuests:{
            some: {
              memberUid: member?.uid
            }
          }
        },
      }) 
    } catch(err) {
      this.handleErrors(err);
    }
  } 

  async updateMemberDetails(guest, member, isAdmin) {
    if (isAdmin) {
      const guestMember = await this.memberService.findOne(guest.memberUid);
      await this.memberService.updateTelegramIfChanged(guestMember, guest.telegramId);
      await this.memberService.updateOfficeHoursIfChanged(guestMember, guest.officeHours);
    } else {
      await this.memberService.updateTelegramIfChanged(member, guest.telegramId);
      await this.memberService.updateOfficeHoursIfChanged(member, guest.officeHours);
    }
  }

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

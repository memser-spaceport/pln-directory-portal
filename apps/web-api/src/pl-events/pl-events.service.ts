import { Injectable, BadRequestException, ConflictException, NotFoundException, Inject, CACHE_MANAGER } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { Cache } from 'cache-manager';


@Injectable()
export class PLEventsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
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
            additionalInfo: true,
            member: {
              select:{
                name: true,
                image: true,
                teamMemberRoles: true,
                preferences: true,
                projectContributions: {
                  select:{
                    project:{
                      select:{
                        name: true
                      }
                    }
                  }
                },
                createdProjects:{
                  select: {
                    name: true
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
    if (plEvent?.resources && plEvent?.resources.length && !isUserLoggedIn) {
      plEvent.resources = plEvent?.resources.filter((resource:any) => { 
        return !resource.isPrivate
      });
    }
    if (isUserLoggedIn && plEvent?.eventGuests) {
      plEvent.eventGuests = plEvent.eventGuests.map((guest:any) => {
        if (!guest.member.preferences) {
          return guest;
        }
        if (!guest.member.preferences.showTelegram) {
          delete guest.telegramId;
        }
        return guest;
      });
    }
    return plEvent;
  };

  async createPLEventGuest(
    guest: Prisma.PLEventGuestUncheckedCreateInput,
    slug: string,
    member
  ) {
    try {  
      const event: any = await this.getPLEventBySlug(slug, true);
      await this.prisma.pLEventGuest.create({
        data:{
          ...guest,
          memberUid: member?.uid,
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
      return await this.prisma.pLEventGuest.update({
        where:{ uid },
        data:{
          ...guest,
          memberUid: member?.uid,
          eventUid: event?.uid
        }
      });  
    } catch(err) {
      this.handleErrors(err);
    }
  };

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

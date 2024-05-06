import { Injectable, BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';


@Injectable()
export class PLEventsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService
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
    return await this.prisma.pLEvent.findUnique({
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
            member: {
              select:{
                name: true,
                image: true
              }
            },
            teamUid: true,
            team: {
              select:{
                name: true,
                logo: true
              }
            } 
          }:
          {
            teamUid: true,
            team: {
              select:{
                name: true,
                logo: true
              }
            }
          }
        }
      }
    });
  };

  async createPLEventGuest(
    guest: Prisma.PLEventGuestUncheckedCreateInput,
    slug: string,
    member
  ) {
    try {  
      const event: any = await this.getPLEventBySlug(slug, true);
      return await this.prisma.pLEventGuest.create({
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
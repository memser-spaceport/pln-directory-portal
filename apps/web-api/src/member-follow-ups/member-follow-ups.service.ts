import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class MemberFollowUpsService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService
  ) {}

  async createFollowUp(
    followUp: Prisma.MemberFollowUpUncheckedCreateInput,
    interaction,
    tx?: Prisma.TransactionClient
  ) {
    try {
      await (tx || this.prisma).memberFollowUp.create({
        data: {
          ...followUp
        }
      });
    } catch(error) {
      this.handleErrors(error);
    }
  }

  async getFollowUps(
    query: Prisma.MemberFollowUpFindManyArgs,
    tx?: Prisma.TransactionClient
  ) {
    try {
      return await (tx || this.prisma).memberFollowUp.findMany({
        ...query,
        where: {
          ...query.where,
          interaction: {
            sourceMember: {
              accessLevel: {
                notIn: ['L0', 'L1', 'Rejected'],
              },
            },
          },
        },
        include: {
          interaction: {
            select: {
              uid: true,
              type: true,
              sourceMember: {
                select: {
                  name: true,
                  image: true,
                },
              },
              targetMember: {
                select: {
                  name: true,
                  image: true,
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


  async updateFollowUpStatusByUid(
    uid: string,
    status,
    tx?: Prisma.TransactionClient
  ) {
    try {
      return await (tx || this.prisma).memberFollowUp.update({
        where: {
          uid
        },
        data: {
          status
        }
      });
    } catch(error) {
      this.handleErrors(error);
    }
  }

  buildDelayedFollowUpQuery() {
    const daysAgo = parseInt(process.env.INTERACTION_FOLLOWUP_DELAY_IN_DAYS || "7")
    const dateOfNthWeekAgo = new Date();
    dateOfNthWeekAgo.setDate(dateOfNthWeekAgo.getDate() - daysAgo);
    return {
      OR: [
        {
          isDelayed: false ,
          createdAt: {
            lte: new Date()
          }
        },
        {
          isDelayed: true,
          createdAt: {
            lte: dateOfNthWeekAgo,
          }
        }
      ]
    }
  };

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on follow ups:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on follow ups', error.message);
        case 'P2025':
          throw new NotFoundException('Follow up is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on follow ups', error.message);
    }
    throw error;
  };
}

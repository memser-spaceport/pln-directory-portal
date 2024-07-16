import { 
  Injectable, 
  BadRequestException, 
  ConflictException, 
  NotFoundException 
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { Prisma } from '@prisma/client';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import {
  MemberFollowUpStatus
} from 'libs/contracts/src/schema';

@Injectable()
export class MemberFeedbacksService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private followUpService: MemberFollowUpsService
  ) {}

  async createFeedback(feedback: Prisma.MemberFeedbackUncheckedCreateInput, loggedInMember, followUp) {
    try {
      const result = await this.prisma.memberFeedback.create({
        data: {
          ...feedback,
          createdBy: loggedInMember.uid,
          followUpUid: followUp.uid
        }
      });
      await this.followUpService.updateFollowUpStatusByUid(followUp.uid, MemberFollowUpStatus.Enum.COMPLETED)
      return result;
    } catch(error) {
      this.handleErrors(error);
    }
  };

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on interaction feed back:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on interaction feed back', error.message);
        case 'P2025':
          throw new NotFoundException('Interaction Feed back is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on interaction feed back', error.message);
    }
    throw error;
  };
}
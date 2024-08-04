import { 
  Injectable, 
  BadRequestException, 
  ConflictException, 
  NotFoundException 
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import { MemberFeedbacksService } from '../member-feedbacks/member-feedbacks.service';
import { Prisma } from '@prisma/client';
import {
  MemberFollowUpStatus,
  MemberFollowUpType,
  MemberFeedbackResponseType
} from 'libs/contracts/src/schema';
import { InteractionFailureReasons } from '../utils/constants';

@Injectable()
export class OfficeHoursService {
  private delayedFollowUps = [ 
    MemberFollowUpType.Enum.MEETING_SCHEDULED, 
    MemberFollowUpType.Enum.MEETING_YET_TO_HAPPEN 
  ];

  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: LogService,
    private readonly followUpService: MemberFollowUpsService,
    private readonly feedbackService: MemberFeedbacksService
  ) {}

  async createInteraction(
    interaction: Prisma.MemberInteractionUncheckedCreateInput,
    loggedInMember
  ) {
    try {
      return this.prisma.$transaction(async(tx) => {
        const result = await tx.memberInteraction.create({
          data:{
            ...interaction,
            sourceMemberUid: loggedInMember?.uid
          }
        });
        if (result?.hasFollowUp) {
          await this.createInteractionFollowUp(result, loggedInMember, MemberFollowUpType.Enum.MEETING_INITIATED, tx);
          await this.createInteractionFollowUp(result, loggedInMember, MemberFollowUpType.Enum.MEETING_SCHEDULED, tx);
        };
        return result;
      });
    } catch(exception) {
      this.handleErrors(exception);
    }
  }

  async findInteractions(queryOptions: Prisma.MemberInteractionFindManyArgs) {
    try {
      return await this.prisma.memberInteraction.findMany({
        ...queryOptions,
        include: {
          interactionFollowUps: true
        }
      });
    } catch(exception) {
      this.handleErrors(exception);
    }
  };

  async createInteractionFollowUp(interaction, loggedInMember, type, tx?, scheduledAt?) {
    const followUp: any = {
      status: MemberFollowUpStatus.Enum.PENDING,
      interactionUid: interaction?.uid,
      createdBy: loggedInMember?.uid,
      type,
      data: {
        ...interaction.data
      },
      isDelayed: this.delayedFollowUps.includes(type)
    };
    if (scheduledAt != null) {
      followUp.createdAt = new Date(scheduledAt);
    }
    return await this.followUpService.createFollowUp(followUp, interaction, tx);
  }

  async createInteractionFeedback(feedback, member, followUp) {
    feedback.comments = feedback.comments?.map(comment => InteractionFailureReasons[comment] || comment) || [];
    return await this.prisma.$transaction(async (tx) => {
      if (
        followUp.type === MemberFollowUpType.Enum.MEETING_INITIATED &&
        feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE
      ) {
        const delayedFollowUps = await this.followUpService.getFollowUps({ 
          where: { 
            interactionUid: followUp.interactionUid,
            type: MemberFollowUpType.Enum.MEETING_SCHEDULED  
          } 
        }, tx);
        if (delayedFollowUps?.length) {
          await this.followUpService.updateFollowUpStatusByUid(
            delayedFollowUps[0]?.uid, 
            MemberFollowUpStatus.Enum.COMPLETED,
            tx
          );
        }
      }
      if ( 
        feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE && 
        feedback.comments?.includes('IFR0004')
      ) {
        await this.createInteractionFollowUp(
          followUp.interaction,
          member, 
          MemberFollowUpType.Enum.MEETING_YET_TO_HAPPEN,
          tx
        ); 
      } else if ( 
        feedback.response === MemberFeedbackResponseType.Enum.NEGATIVE && 
        feedback.comments?.includes('IFR0005')
      ) {
        await this.createInteractionFollowUp(
          followUp.interaction,
          member,
          MemberFollowUpType.Enum.MEETING_RESCHEDULED,
          tx,
          feedback?.data?.scheduledAt
        ); 
      }
      return await this.feedbackService.createFeedback(feedback, member, followUp, tx);
    });
  }

  private handleErrors(error, message?) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          throw new ConflictException('Unique key constraint error on interactions:', error.message);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on interactions', error.message);
        case 'P2025':
          throw new NotFoundException('Interactions is not found with uid:' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Interactions', error.message);
    }
    throw error;
  };
}
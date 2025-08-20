import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException
} from '@nestjs/common';
import { LogService } from '../shared/log.service';
import { PrismaService } from '../shared/prisma.service';
import {CounterAdjustmentReason, MemberFeedbackResponseType, Prisma} from '@prisma/client';
import { MemberFollowUpsService } from '../member-follow-ups/member-follow-ups.service';
import {
  MemberFollowUpStatus
} from 'libs/contracts/src/schema';
import {
  MemberInteractionAdjustmentsService
} from "../member-interaction-adjustments/member-interaction-adjustments.service";

@Injectable()
export class MemberFeedbacksService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private followUpService: MemberFollowUpsService,
    private adjustmentsService: MemberInteractionAdjustmentsService
  ) {}

  /**
   * Creates a feedback, completes the follow-up, and (when negative)
   * adjusts the schedule counter for the related scheduling interaction.
   */
  async createFeedback(
    feedback: Prisma.MemberFeedbackUncheckedCreateInput,
    loggedInMember: { uid: string },
    followUp: { uid: string; interactionUid?: string | null; type?: string },
    tx?: Prisma.TransactionClient
  ) {
    try {
      const client = tx ?? this.prisma;
      const result = await client.memberFeedback.create({
        data: {
          ...feedback,
          createdBy: loggedInMember.uid,
          followUpUid: followUp.uid
        }
      });
      await this.followUpService.updateFollowUpStatusByUid(followUp.uid, MemberFollowUpStatus.Enum.COMPLETED, tx)

      // Map your own rules to reasons at the call site (no hardcode inside the adjustments service)
      // Example rule: only NEGATIVE response -> NEGATIVE_FEEDBACK reason
      if (feedback.response === MemberFeedbackResponseType.NEGATIVE && tx) {
        await this.adjustmentsService.applyAdjustmentForFollowUpTx(tx, {
          followUpUid: followUp.uid,
          reason: CounterAdjustmentReason.NEGATIVE_FEEDBACK,
          createdByUid: loggedInMember.uid,
        });
      }

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

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FounderReviewFeedback, FounderReviewStatus } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ReviewFounderDto } from './dto/review-founder.dto';
import { parseReviewChannel, parseReviewFeedback, parseReviewStatus } from './founder-sourcing.vocab';

@Injectable()
export class FounderSourcingReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async updateReview(founderId: string, input: ReviewFounderDto, reviewedByMemberUid?: string) {
    const hasStatus = input.status !== undefined && input.status !== null && String(input.status).trim() !== '';
    const hasChannel = input.channel !== undefined && input.channel !== null && String(input.channel).trim() !== '';
    const hasNote = input.note !== undefined && input.note !== null && input.note.trim() !== '';

    if (!hasStatus && !hasChannel && !hasNote) {
      throw new BadRequestException('At least one of status, channel, or note is required');
    }

    const existing = await this.prisma.founderSourcingRecord.findUnique({
      where: { founderId },
      select: { id: true, reviewStatus: true },
    });
    if (!existing) throw new NotFoundException(`Founder not found: ${founderId}`);

    let reviewStatus: FounderReviewStatus = existing.reviewStatus;
    if (hasStatus) {
      const parsed = parseReviewStatus(input.status!);
      if (!parsed) {
        throw new BadRequestException('status must be one of: new, in-review, approved, rejected, hold');
      }
      reviewStatus = parsed;
    }

    let reviewFeedback: FounderReviewFeedback | null | undefined = undefined;
    if (input.feedback !== undefined) {
      if (input.feedback === null || String(input.feedback).trim() === '') {
        reviewFeedback = null;
      } else {
        const parsed = parseReviewFeedback(input.feedback);
        if (!parsed) {
          throw new BadRequestException('feedback must be one of: good, bad, wrong-fund, needs-context');
        }
        reviewFeedback = parsed;
      }
    }

    let reviewChannel: string | null | undefined = undefined;
    if (hasChannel) {
      const parsed = parseReviewChannel(input.channel!);
      if (!parsed) {
        throw new BadRequestException('channel must be one of: lead-decision, record-quality, platform');
      }
      reviewChannel = parsed;
    } else if (hasStatus && (reviewStatus === FounderReviewStatus.APPROVED || reviewStatus === FounderReviewStatus.REJECTED)) {
      reviewChannel = 'lead-decision';
    }

    let reviewField: string | null | undefined = undefined;
    if (input.field !== undefined) {
      const trimmed = input.field?.trim();
      reviewField = trimmed && trimmed !== '' ? trimmed.slice(0, 80) : null;
    }

    let reviewArea: string | null | undefined = undefined;
    if (input.area !== undefined) {
      const trimmed = input.area?.trim();
      reviewArea = trimmed && trimmed !== '' ? trimmed.slice(0, 80) : null;
    }

    const note = input.note?.trim();

    return this.prisma.founderSourcingRecord.update({
      where: { founderId },
      data: {
        reviewStatus,
        ...(reviewFeedback !== undefined ? { reviewFeedback } : {}),
        ...(reviewChannel !== undefined ? { reviewChannel } : {}),
        ...(reviewField !== undefined ? { reviewField } : {}),
        ...(reviewArea !== undefined ? { reviewArea } : {}),
        reviewNote: note && note !== '' ? note : hasNote ? null : undefined,
        reviewDecidedAt: new Date(),
        reviewedByMemberUid: reviewedByMemberUid ?? null,
      },
    });
  }
}

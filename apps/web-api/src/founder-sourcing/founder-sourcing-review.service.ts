import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FounderReviewFeedback } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { ReviewFounderDto } from './dto/review-founder.dto';
import { parseReviewFeedback, parseReviewStatus } from './founder-sourcing.vocab';

@Injectable()
export class FounderSourcingReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async updateReview(founderId: string, input: ReviewFounderDto, reviewedByMemberUid?: string) {
    const status = parseReviewStatus(input.status);
    if (!status) {
      throw new BadRequestException('status must be one of: new, in-review, approved, rejected, hold');
    }
    const feedback = this.parseFeedback(input.feedback);
    const note = input.note?.trim();

    const existing = await this.prisma.founderSourcingRecord.findUnique({
      where: { founderId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException(`Founder not found: ${founderId}`);

    return this.prisma.founderSourcingRecord.update({
      where: { founderId },
      data: {
        reviewStatus: status,
        reviewFeedback: feedback,
        reviewNote: note && note !== '' ? note : null,
        reviewDecidedAt: new Date(),
        reviewedByMemberUid: reviewedByMemberUid ?? null,
      },
    });
  }

  private parseFeedback(feedback: ReviewFounderDto['feedback'] | undefined): FounderReviewFeedback | null | undefined {
    if (feedback === undefined) return undefined;
    const parsed = parseReviewFeedback(feedback);
    if (!parsed) {
      throw new BadRequestException('feedback must be one of: good, bad, wrong-fund, needs-context');
    }
    return parsed;
  }
}

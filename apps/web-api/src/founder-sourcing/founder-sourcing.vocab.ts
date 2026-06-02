import { FounderReviewFeedback, FounderReviewStatus } from '@prisma/client';
import { FounderFundCode } from './dto/ingest-founder-sourcing.dto';

const FUND_CODES = new Set<FounderFundCode>(['PLVS', 'NEURO', 'CRYPTO']);
const REVIEW_STATUSES = new Set<FounderReviewStatus>([
  FounderReviewStatus.NEW,
  FounderReviewStatus.IN_REVIEW,
  FounderReviewStatus.APPROVED,
  FounderReviewStatus.REJECTED,
  FounderReviewStatus.HOLD,
]);
const REVIEW_FEEDBACKS = new Set<FounderReviewFeedback>([
  FounderReviewFeedback.GOOD,
  FounderReviewFeedback.BAD,
  FounderReviewFeedback.WRONG_FUND,
  FounderReviewFeedback.NEEDS_CONTEXT,
]);

export const isAllowedFundCode = (value: string): value is FounderFundCode => FUND_CODES.has(value as FounderFundCode);

export const parseReviewStatus = (value: string): FounderReviewStatus | undefined => {
  const normalized = value.trim().toLowerCase();
  const mapped =
    normalized === 'new'
      ? FounderReviewStatus.NEW
      : normalized === 'in-review'
      ? FounderReviewStatus.IN_REVIEW
      : normalized === 'approved'
      ? FounderReviewStatus.APPROVED
      : normalized === 'rejected'
      ? FounderReviewStatus.REJECTED
      : normalized === 'hold'
      ? FounderReviewStatus.HOLD
      : undefined;
  if (!mapped || !REVIEW_STATUSES.has(mapped)) return undefined;
  return mapped;
};

export const parseReviewFeedback = (value: string): FounderReviewFeedback | undefined => {
  const normalized = value.trim().toLowerCase();
  const mapped =
    normalized === 'good'
      ? FounderReviewFeedback.GOOD
      : normalized === 'bad'
      ? FounderReviewFeedback.BAD
      : normalized === 'wrong-fund'
      ? FounderReviewFeedback.WRONG_FUND
      : normalized === 'needs-context'
      ? FounderReviewFeedback.NEEDS_CONTEXT
      : undefined;
  if (!mapped || !REVIEW_FEEDBACKS.has(mapped)) return undefined;
  return mapped;
};

export const reviewStatusToApi = (value: FounderReviewStatus): 'new' | 'in-review' | 'approved' | 'rejected' | 'hold' =>
  value === FounderReviewStatus.NEW
    ? 'new'
    : value === FounderReviewStatus.IN_REVIEW
    ? 'in-review'
    : value === FounderReviewStatus.APPROVED
    ? 'approved'
    : value === FounderReviewStatus.REJECTED
    ? 'rejected'
    : 'hold';

export const reviewFeedbackToApi = (
  value: FounderReviewFeedback | null
): 'good' | 'bad' | 'wrong-fund' | 'needs-context' | undefined => {
  if (value === FounderReviewFeedback.GOOD) return 'good';
  if (value === FounderReviewFeedback.BAD) return 'bad';
  if (value === FounderReviewFeedback.WRONG_FUND) return 'wrong-fund';
  if (value === FounderReviewFeedback.NEEDS_CONTEXT) return 'needs-context';
  return undefined;
};

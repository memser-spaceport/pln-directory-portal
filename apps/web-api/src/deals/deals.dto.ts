import { DealIssueStatus, DealStatus, DealSubmissionStatus } from '@prisma/client';

export class ListDealsQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  category?: string;
  audience?: string;
  sort?: 'alphabetical' | 'mostRecent' = 'mostRecent';
  /** Optional absolute ISO cutoff; wins over windowDays when parseable. */
  since?: string;
  /** Optional rolling window in days. Omitted = no date filter. */
  windowDays?: number;
}

export class UpsertDealDto {
  vendorName?: string;
  vendorTeamUid?: string;
  logoUid?: string | null;
  category?: string;
  audience?: string;
  shortDescription!: string;
  fullDescription!: string;
  redemptionInstructions!: string;
  contact!: string;
  status?: DealStatus;
  submissionUid?: string;
  isHighValue?: boolean;
}

export class SubmitDealDto {
  vendorName?: string;
  vendorTeamUid?: string;
  logoUid?: string | null;
  category?: string;
  audience?: string;
  shortDescription!: string;
  fullDescription!: string;
  redemptionInstructions!: string;
  howToReachOutToYou?: string;
}

export class ReportDealIssueDto {
  description!: string;
}

export class UpdateDealAccessDto {
  memberUid!: string;
}

export class DealAdminMetricsDto {
  tappedHowToRedeemCount!: number;
  markedAsUsingCount!: number;
  submittedIssuesCount!: number;
}

export class ListDealSubmissionsQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  status?: DealSubmissionStatus;
}

export class UpdateDealSubmissionDto {
  status!: DealSubmissionStatus;
}

export class ListDealIssuesQueryDto {
  page?: number = 1;
  limit?: number = 20;
  search?: string;
  status?: DealIssueStatus;
  dealUid?: string;
}

export class UpdateDealIssueDto {
  status!: DealIssueStatus;
}

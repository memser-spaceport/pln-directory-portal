export type DealStatus = 'DRAFT' | 'ACTIVE' | 'DEACTIVATED';

export type Deal = {
  uid: string;
  vendorName: string;
  vendorTeamUid: string | null;
  logoUid: string | null;
  logoUrl?: string | null;
  category: string;
  audience: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  isHighValue: boolean;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
  tappedHowToRedeemCount: number;
  markedAsUsingCount: number;
  submittedIssuesCount: number;
};

export type TDealForm = {
  vendorName: string;
  vendorTeamUid?: string | null;
  logoUid?: string | null;
  category: string;
  audience: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  isHighValue: boolean;
  status: DealStatus;
  /** Set when creating a catalog deal from a submission (Review Deal). */
  submissionUid?: string;
};

export type SubmissionStatus = 'OPEN' | 'APPROVED' | 'REJECTED';

export type SubmittedDeal = {
  uid: string;
  vendorName: string;
  vendorTeamUid: string | null;
  logoUid: string | null;
  category: string;
  audience: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  howToReachOutToYou: string | null;
  authorMemberUid: string | null;
  authorTeamUid: string | null;
  status: SubmissionStatus;
  reviewedByMemberUid: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  logo: { uid: string; url: string } | null;
  authorMember: {
    uid: string;
    name: string;
    email: string;
    image: { url: string } | null;
  } | null;
  authorTeam: {
    uid: string;
    name: string;
  } | null;
};

export type IssueStatus = 'OPEN' | 'RESOLVED';

export type ReportedIssue = {
  uid: string;
  dealUid: string;
  authorMemberUid: string;
  authorTeamUid: string | null;
  description: string;
  status: IssueStatus;
  resolvedByMemberUid: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deal: {
    uid: string;
    vendorName: string;
    category: string;
    audience: string;
    status: DealStatus;
  };
  authorMember: {
    uid: string;
    name: string;
    email: string;
    image: { url: string } | null;
  };
  authorTeam: {
    uid: string;
    name: string;
  } | null;
  resolvedByMember: {
    uid: string;
    name: string;
    email: string;
  } | null;
};

export type DealCounts = {
  catalog: number;
  submitted: number;
  issues: number;
  requests: number;
};

export type DealRequest = {
  uid: string;
  dealUid: string;
  requestedByUserUid: string;
  description: string;
  whatDealAreYouLookingFor: string;
  howToReachOutToYou: string;
  createdAt: string;
  updatedAt: string;
  deal: {
    uid: string;
    vendorName: string;
  } | null;
  requestedByUser: {
    uid: string;
    name: string;
    email: string;
    image: { uid: string; url: string } | null;
  };
};

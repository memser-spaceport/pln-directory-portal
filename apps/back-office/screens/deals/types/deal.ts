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
  status: DealStatus;
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
  authorMemberUid: string;
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
  };
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
};

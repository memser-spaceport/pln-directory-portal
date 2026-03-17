export type DealStatus = 'Draft' | 'Active' | 'Deactivated';
export type DealAudience = 'All Founders' | 'PL Funded Founders';

export type Deal = {
  uid: string;
  vendorName: string;
  vendorLogoUrl: string | null;
  category: string;
  audience: DealAudience;
  markedAsUsingCount: number | null;
  tappedHowToRedeemCount: number | null;
  submittedIssuesCount: number;
  status: DealStatus;
  updatedAt: string; // ISO date string
};

export type SubmittedDeal = {
  uid: string;
  vendorName: string;
  submittedBy: string;
  submittedByEmail: string;
  category: string;
  audience: DealAudience;
  description: string;
  submittedAt: string;
};

export type ReportedIssue = {
  uid: string;
  dealUid: string;
  vendorName: string;
  reportedBy: string;
  reportedByEmail: string;
  issueDescription: string;
  reportedAt: string;
};

export type TDealForm = {
  vendorName: string;
  vendorLogo: File | null;
  category: string;
  audience: DealAudience | null;
  description: string;
  dealUrl: string;
  howToRedeem: string;
  status: DealStatus;
};

export type DealCounts = {
  catalog: number;
  submitted: number;
  issues: number;
};

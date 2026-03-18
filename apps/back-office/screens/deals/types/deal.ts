export type DealStatus = 'DRAFT' | 'ACTIVE' | 'DEACTIVATED';

export type Deal = {
  uid: string;
  vendorName: string;
  vendorTeamUid: string | null;
  logoUid: string | null;
  category: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  status: DealStatus;
  createdAt: string;
  updatedAt: string;
};

export type TDealForm = {
  vendorName: string;
  category: string;
  shortDescription: string;
  fullDescription: string;
  redemptionInstructions: string;
  status: DealStatus;
};

export type SubmittedDeal = {
  uid: string;
  vendorName: string;
  submittedBy: string;
  submittedByEmail: string;
  category: string;
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

export type DealCounts = {
  catalog: number;
  submitted: number;
  issues: number;
};

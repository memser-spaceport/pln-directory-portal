export type InvestorBulkParticipantInput = {
  email: string;
  name: string;
  organization?: string | null;
  organizationEmail?: string | null;
  twitterHandler?: string | null;
  linkedinHandler?: string | null;
  telegramHandler?: string | null;
  role?: string | null;
  investmentType?: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null;
  typicalCheckSize?: number | null;
  investInStartupStages?: string[] | null;
  secRulesAccepted?: boolean | null;
  makeTeamLead?: boolean;
};

export type InvestorBulkProvisionSummaryDelta = {
  createdUsers: number;
  updatedUsers: number;
  createdTeams: number;
  updatedMemberships: number;
  promotedToLead: number;
};

export type InvestorBulkProvisionResult = {
  memberUid: string;
  orgTeamUid?: string;
  isNewUser: boolean;
  willBeTeamLead: boolean;
  normalizedTwitter?: string;
  normalizedLinkedin?: string;
  normalizedTelegram?: string;
  summaryDelta: InvestorBulkProvisionSummaryDelta;
};

export type InvestorBulkRowResult = {
  email: string;
  name: string;
  organization?: string | null;
  organizationEmail?: string | null;
  twitterHandler?: string;
  linkedinHandler?: string;
  telegramHandler?: string;
  role?: string | null;
  investmentType?: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null;
  typicalCheckSize?: number | null;
  investInStartupStages?: string[] | null;
  secRulesAccepted?: boolean | null;
  makeTeamLead?: boolean;
  willBeTeamLead: boolean;
  status: 'success' | 'error';
  message?: string;
  userId?: string;
  teamId?: string;
};

export type InvestorBulkSummary = {
  total: number;
  createdUsers: number;
  updatedUsers: number;
  createdTeams: number;
  updatedMemberships: number;
  promotedToLead: number;
  errors: number;
};

export type ExistingMemberForBulk = {
  uid: string;
  email: string | null;
  investorProfile?: {
    type: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND' | null;
    secRulesAccepted: boolean | null;
    typicalCheckSize: number | null;
    investInStartupStages: string[] | null;
  } | null;
  teamMemberRoles?: Array<{
    mainTeam: boolean | null;
    investmentTeam: boolean | null;
    teamLead: boolean | null;
    role: string | null;
  }>;
};

export type InvestorBulkProvisionOptions = {
  useApproveOnLogin?: boolean;
  memberCreationReason?: string;
};

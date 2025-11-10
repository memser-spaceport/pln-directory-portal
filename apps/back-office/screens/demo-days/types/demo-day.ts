export interface DemoDay {
  uid: string;
  title: string;
  description: string;
  shortDescription?: string;
  startDate: string;
  endDate: string;
  status: 'UPCOMING' | 'REGISTRATION_OPEN' | 'EARLY_ACCESS' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateDemoDayDto {
  title: string;
  description: string;
  shortDescription?: string;
  startDate: string;
  endDate: string;
  status: 'UPCOMING' | 'REGISTRATION_OPEN' | 'EARLY_ACCESS' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}

export interface UpdateDemoDayDto {
  title?: string;
  description?: string;
  shortDescription?: string;
  startDate?: string;
  endDate?: string;
  status?: 'UPCOMING' | 'REGISTRATION_OPEN' | 'EARLY_ACCESS' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
}

export interface DemoDayParticipant {
  uid: string;
  demoDayUid: string;
  memberUid?: string;
  email: string;
  name: string;
  type: 'INVESTOR' | 'FOUNDER';
  status: 'INVITED' | 'ENABLED' | 'DISABLED';
  hasEarlyAccess: boolean;
  teamUid?: string;
  createdAt: string;
  updatedAt: string;
  member?: {
    uid: string;
    name: string;
    email: string;
    profilePicture?: string;
    accessLevel?: string;
    externalId?: string;
    teamMemberRoles?: {
      mainTeam: boolean;
      teamLead: boolean;
      role: string;
      team: {
        uid: string;
        name: string;
      };
    }[];
    investorProfile?: {
      type?: 'ANGEL' | 'FUND' | 'ANGEL_AND_FUND';
      investmentFocus?: string[];
      typicalCheckSize?: number;
      secRulesAccepted?: boolean;
      investInStartupStages?: string[];
      investInFundTypes?: string[];
    };
  };
  team?: {
    uid: string;
    name: string;
    fundraisingProfiles?: Array<{
      uid: string;
      status: string;
      onePagerUpload?: {
        uid: string;
        url: string;
        filename: string;
      };
      videoUpload?: {
        uid: string;
        url: string;
        filename: string;
      };
    }>;
  };
}

export interface AddParticipantDto {
  memberUid?: string;
  email?: string;
  name?: string;
  type: 'INVESTOR' | 'FOUNDER';
}

export interface AddParticipantsBulkDto {
  participants: Array<{
    email: string;
    name: string;
    organization?: string;
    organizationEmail?: string;
    twitterHandler?: string;
    linkedinHandler?: string;
    makeTeamLead?: boolean;
  }>;
}

export interface BulkParticipantsResponse {
  summary: {
    total: number;
    createdUsers: number;
    updatedUsers: number;
    createdTeams: number;
    updatedMemberships: number;
    promotedToLead: number;
    errors: number;
  };
  rows: Array<{
    email: string;
    name: string;
    organization?: string;
    organizationEmail?: string;
    twitterHandler?: string;
    linkedinHandler?: string;
    makeTeamLead?: boolean;
    willBeTeamLead: boolean;
    status: 'success' | 'error';
    message?: string;
    userId?: string;
    teamId?: string;
  }>;
}

export interface GetParticipantsQueryDto {
  page?: number;
  limit?: number;
  status?: 'INVITED' | 'ENABLED' | 'DISABLED';
  type?: 'INVESTOR' | 'FOUNDER';
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface ParticipantsListResponse {
  participants: DemoDayParticipant[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UpdateParticipantDto {
  status?: 'INVITED' | 'ENABLED' | 'DISABLED';
  teamUid?: string;
  type?: 'INVESTOR' | 'FOUNDER';
  hasEarlyAccess?: boolean;
}

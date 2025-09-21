export interface DemoDay {
  uid: string;
  title: string;
  description: string;
  startDate: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface CreateDemoDayDto {
  title: string;
  description: string;
  startDate: string;
  status: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
}

export interface UpdateDemoDayDto {
  title?: string;
  description?: string;
  startDate?: string;
  status?: 'UPCOMING' | 'ACTIVE' | 'COMPLETED';
}

export interface DemoDayParticipant {
  uid: string;
  demoDayUid: string;
  memberUid?: string;
  email: string;
  name: string;
  type: 'INVESTOR' | 'FOUNDER';
  status: 'INVITED' | 'ENABLED' | 'DISABLED';
  teamUid?: string;
  createdAt: string;
  updatedAt: string;
  member?: {
    uid: string;
    name: string;
    email: string;
    profilePicture?: string;
    accessLevel?: string;
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
    twitterHandler?: string;
    linkedinHandler?: string;
    makeTeamLead?: boolean;
  }>;
  type: 'INVESTOR' | 'FOUNDER';
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
    twitterHandler?: string;
    linkedinHandler?: string;
    makeTeamLead?: boolean;
    willBeTeamLead: boolean;
    status: 'success' | 'error';
    message?: string;
    userId?: string;
    teamId?: string;
    membershipRole?: 'LEAD' | 'MEMBER' | 'NONE';
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
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface UpdateParticipantDto {
  status?: 'INVITED' | 'ENABLED' | 'DISABLED';
  teamUid?: string;
}

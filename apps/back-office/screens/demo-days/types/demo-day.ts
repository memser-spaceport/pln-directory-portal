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
  members: Array<{
    email: string;
    name?: string;
  }>;
  type: 'INVESTOR' | 'FOUNDER';
}

export interface BulkParticipantsResponse {
  status: 'SUCCESS' | 'FAIL';
  failedMembers: Array<{
    email: string;
    name?: string;
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

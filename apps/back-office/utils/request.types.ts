export interface IRequest {
  memberList: IPendingResponse[];
  teamList: IPendingResponse[];
  teamCount: number;
  memberCount: number;
}

export interface IPendingResponse {
  id: string;
  name: string;
  status: string;
  email: string;
  skills: string[];
  teamAndRoles: string[];
  projectContributions: string[];
  isSubscribedToNewsletter: boolean;
  teamOrProjectURL: string;
  imageUrl: string;
}

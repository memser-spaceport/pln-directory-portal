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
}

import api from '../api';
import { API_ROUTE } from '../constants';

export interface SpvInvestorList {
  uid: string;
  name: string;
  emails: string[];
}

const investorListsRoute = (spotlightUid: string) => `${API_ROUTE.ADMIN_SPV_SPOTLIGHTS}/${spotlightUid}/investor-lists`;

export async function fetchSpvInvestorLists(spotlightUid: string): Promise<SpvInvestorList[]> {
  const response = await api.get<SpvInvestorList[]>(investorListsRoute(spotlightUid));
  return response.data;
}

export async function createSpvInvestorList(params: {
  spotlightUid: string;
  name: string;
  participantUids: string[];
}): Promise<SpvInvestorList> {
  const { spotlightUid, name, participantUids } = params;
  const response = await api.post<SpvInvestorList>(investorListsRoute(spotlightUid), { name, participantUids });
  return response.data;
}

export async function updateSpvInvestorList(params: {
  spotlightUid: string;
  listUid: string;
  name: string;
  emails: string[];
}): Promise<SpvInvestorList> {
  const { spotlightUid, listUid, name, emails } = params;
  const response = await api.patch<SpvInvestorList>(`${investorListsRoute(spotlightUid)}/${listUid}`, {
    name,
    emails,
  });
  return response.data;
}

export async function deleteSpvInvestorList(params: { spotlightUid: string; listUid: string }): Promise<void> {
  const { spotlightUid, listUid } = params;
  await api.delete(`${investorListsRoute(spotlightUid)}/${listUid}`);
}

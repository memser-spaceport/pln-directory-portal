import { Deal, DealCounts, ReportedIssue, SubmissionStatus, SubmittedDeal, TDealForm } from '../../screens/deals/types/deal';
import api from '../api';
import { API_ROUTE } from '../constants';

// ---------------------------------------------------------------------------
// Real API functions
// ---------------------------------------------------------------------------

interface DealsListParams {
  authToken: string | undefined;
  category?: string;
  search?: string;
}

export async function fetchDealsList(params: DealsListParams): Promise<{ data: Deal[] }> {
  const response = await api.get<Deal[]>(API_ROUTE.ADMIN_DEALS, {
    headers: { authorization: `Bearer ${params.authToken}` },
    params: {
      ...(params.category && { category: params.category }),
      ...(params.search && { search: params.search }),
    },
  });
  return { data: response.data };
}

export async function createDeal(params: { authToken: string | undefined; payload: TDealForm }): Promise<Deal> {
  const response = await api.post<Deal>(API_ROUTE.ADMIN_DEALS, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}

export async function updateDeal(params: {
  authToken: string | undefined;
  uid: string;
  payload: Partial<TDealForm & { status: string }>;
}): Promise<Deal> {
  const response = await api.patch<Deal>(`${API_ROUTE.ADMIN_DEALS}/${params.uid}`, params.payload, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return response.data;
}

export async function fetchSubmittedDeals(params: { authToken: string | undefined }): Promise<{ data: SubmittedDeal[] }> {
  const response = await api.get<SubmittedDeal[]>(API_ROUTE.ADMIN_SUBMITTED_DEALS, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return { data: response.data };
}

export async function approveSubmission(params: {
  authToken: string | undefined;
  uid: string;
  status: SubmissionStatus;
}): Promise<SubmittedDeal> {
  const response = await api.patch<SubmittedDeal>(
    `${API_ROUTE.ADMIN_SUBMITTED_DEALS}/${params.uid}`,
    { status: params.status },
    { headers: { authorization: `Bearer ${params.authToken}` } }
  );
  return response.data;
}

export async function fetchReportedIssues(params: { authToken: string | undefined }): Promise<{ data: ReportedIssue[] }> {
  const response = await api.get<ReportedIssue[]>(API_ROUTE.ADMIN_REPORTED_ISSUES, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return { data: response.data };
}

export async function fetchDealCounts(params: { authToken: string | undefined }): Promise<DealCounts> {
  // Use the deals list length as the count since there's no dedicated counts endpoint
  const response = await api.get<Deal[]>(API_ROUTE.ADMIN_DEALS, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return {
    catalog: response.data.length,
    submitted: 0,
    issues: 0,
  };
}

// ---------------------------------------------------------------------------
// Whitelist API functions
// ---------------------------------------------------------------------------

export interface DealWhitelistMember {
  id: number;
  memberUid: string;
  createdAt: string;
  updatedAt: string;
  member: {
    uid: string;
    name: string | null;
    email: string;
    imageUrl: string | null;
  };
}

export async function fetchDealWhitelist(params: { authToken: string | undefined }): Promise<{ data: DealWhitelistMember[] }> {
  const response = await api.get<DealWhitelistMember[]>(API_ROUTE.ADMIN_DEALS_WHITELIST, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
  return { data: response.data };
}

export async function addDealWhitelistMember(params: {
  authToken: string | undefined;
  memberUid: string;
}): Promise<void> {
  await api.post(
    API_ROUTE.ADMIN_DEALS_WHITELIST,
    { memberUid: params.memberUid },
    { headers: { authorization: `Bearer ${params.authToken}` } }
  );
}

export async function removeDealWhitelistMember(params: {
  authToken: string | undefined;
  memberUid: string;
}): Promise<void> {
  await api.delete(`${API_ROUTE.ADMIN_DEALS_WHITELIST}/${params.memberUid}`, {
    headers: { authorization: `Bearer ${params.authToken}` },
  });
}


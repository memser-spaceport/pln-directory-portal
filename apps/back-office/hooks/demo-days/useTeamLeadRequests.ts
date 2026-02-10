import { useQuery } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamLeadRequestsListResponse, TeamLeadRequestStatus } from '../../screens/demo-days/types/demo-day';

interface QueryParams {
  authToken: string | undefined;
  demoDayUid: string;
  query?: {
    page?: number;
    limit?: number;
    status?: TeamLeadRequestStatus;
    search?: string;
  };
}

async function fetcher(params: QueryParams): Promise<TeamLeadRequestsListResponse> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const queryParams = new URLSearchParams();
  if (params.query?.page) queryParams.append('page', params.query.page.toString());
  if (params.query?.limit) queryParams.append('limit', params.query.limit.toString());
  if (params.query?.status) queryParams.append('status', params.query.status);
  if (params.query?.search) queryParams.append('search', params.query.search);

  const queryString = queryParams.toString();
  const url = `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/team-lead-requests${queryString ? `?${queryString}` : ''}`;

  const { data } = await api.get<TeamLeadRequestsListResponse>(url, config);
  return data;
}

export function useTeamLeadRequests(params: QueryParams) {
  return useQuery({
    queryKey: [DemoDaysQueryKeys.GET_TEAM_LEAD_REQUESTS, params.authToken, params.demoDayUid, params.query],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken && !!params.demoDayUid,
  });
}

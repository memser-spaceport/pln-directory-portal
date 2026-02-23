import { useQuery } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

export interface DashboardWhitelistMember {
  memberUid: string;
  member: {
    uid: string;
    name: string | null;
    email: string;
    imageUrl: string | null;
  };
  participantType: 'INVESTOR' | 'FOUNDER' | 'SUPPORT' | 'NONE';
  participantStatus: 'PENDING' | 'INVITED' | 'ENABLED' | 'DISABLED' | 'NONE';
  teamName: string | null;
}

interface QueryParams {
  authToken: string | undefined;
  demoDayUid: string | undefined;
}

async function fetcher(params: QueryParams): Promise<DashboardWhitelistMember[]> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.get<DashboardWhitelistMember[]>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/dashboard-whitelist`,
    config
  );
  return data;
}

export function useDashboardWhitelist(params: QueryParams) {
  return useQuery({
    queryKey: [DemoDaysQueryKeys.GET_DASHBOARD_WHITELIST, params.authToken, params.demoDayUid],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken && !!params.demoDayUid,
  });
}

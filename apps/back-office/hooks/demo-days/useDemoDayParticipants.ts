import { useQuery } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import {
  DemoDayParticipant,
  GetParticipantsQueryDto,
  ParticipantsListResponse,
} from '../../screens/demo-days/types/demo-day';

interface QueryParams {
  authToken: string | undefined;
  demoDayUid: string;
  query?: GetParticipantsQueryDto;
}

async function fetcher(params: QueryParams): Promise<ParticipantsListResponse> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const queryParams = new URLSearchParams();
  if (params.query?.page) queryParams.append('page', params.query.page.toString());
  if (params.query?.limit) queryParams.append('limit', params.query.limit.toString());
  if (params.query?.status) queryParams.append('status', params.query.status);
  if (params.query?.type) queryParams.append('type', params.query.type);
  if (params.query?.search) queryParams.append('search', params.query.search);
  if (params.query?.sortBy) queryParams.append('sortBy', params.query.sortBy);
  if (params.query?.sortOrder) queryParams.append('sortOrder', params.query.sortOrder);

  const queryString = queryParams.toString();
  const url = `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/participants${queryString ? `?${queryString}` : ''}`;

  const { data } = await api.get<ParticipantsListResponse>(url, config);
  return data;
}

export function useDemoDayParticipants(params: QueryParams) {
  return useQuery({
    queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, params.authToken, params.demoDayUid, params.query],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken && !!params.demoDayUid,
  });
}

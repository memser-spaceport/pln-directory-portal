import { useQuery } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

export interface EventSubscriber {
  email: string;
  memberUid?: string;
  subscribedAt?: string;
  [key: string]: any;
}

interface QueryParams {
  authToken: string | undefined;
}

async function fetcher(params: QueryParams): Promise<EventSubscriber[]> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.get<EventSubscriber[]>(API_ROUTE.ADMIN_DEMO_DAY_SUBSCRIBERS, config);
  return data;
}

export function useDemoDaySubscribers(params: QueryParams) {
  return useQuery({
    queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_SUBSCRIBERS, params.authToken],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken,
  });
}

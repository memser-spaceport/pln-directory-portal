import { useQuery } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { DemoDay } from '../../screens/demo-days/types/demo-day';

interface QueryParams {
  authToken: string | undefined;
  uid: string;
}

async function fetcher(params: QueryParams): Promise<DemoDay> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.get<DemoDay>(`${API_ROUTE.ADMIN_DEMO_DAYS}/${params.uid}`, config);
  return data;
}

export function useDemoDayDetails(params: QueryParams) {
  return useQuery({
    queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_DETAILS, params.authToken, params.uid],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken && !!params.uid,
  });
}

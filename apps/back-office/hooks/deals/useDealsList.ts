import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchDealsList } from '../../utils/services/deal';

interface QueryParams {
  authToken: string | undefined;
  category?: string;
  audience?: string;
  status?: string;
}

export function useDealsList(params: QueryParams) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEALS_LIST, params.authToken, params.category, params.audience, params.status],
    queryFn: () => fetchDealsList(params),
    enabled: true, // mocked — no auth needed yet; set to !!params.authToken when real API is wired
  });
}

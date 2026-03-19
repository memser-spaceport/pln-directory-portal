import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchDealsList } from '../../utils/services/deal';

interface QueryParams {
  authToken: string | undefined;
  category?: string;
  search?: string;
}

export function useDealsList(params: QueryParams) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEALS_LIST, params.authToken, params.category, params.search],
    queryFn: () => fetchDealsList(params),
    enabled: !!params.authToken,
  });
}

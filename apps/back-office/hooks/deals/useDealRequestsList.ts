import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchDealRequestsList } from '../../utils/services/deal';

export function useDealRequestsList(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEAL_REQUESTS_LIST, params.authToken],
    queryFn: () => fetchDealRequestsList(params),
    enabled: true,
  });
}

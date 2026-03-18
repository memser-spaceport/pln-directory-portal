import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchDealCounts } from '../../utils/services/deal';

export function useDealCounts(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_DEALS_COUNTS, params.authToken],
    queryFn: () => fetchDealCounts(params),
    enabled: true,
  });
}

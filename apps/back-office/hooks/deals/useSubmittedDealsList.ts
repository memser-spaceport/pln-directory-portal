import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchSubmittedDeals } from '../../utils/services/deal';

export function useSubmittedDealsList(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_SUBMITTED_DEALS_LIST, params.authToken],
    queryFn: () => fetchSubmittedDeals(params),
    enabled: true,
  });
}

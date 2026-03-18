import { useQuery } from '@tanstack/react-query';
import { fetchDealWhitelist, DealWhitelistMember } from '../../utils/services/deal';
import { DealsQueryKeys } from './constants/queryKeys';

interface UseDealsWhitelistParams {
  authToken: string | undefined;
}

export function useDealsWhitelist(params: UseDealsWhitelistParams) {
  return useQuery<DealWhitelistMember[]>({
    queryKey: [DealsQueryKeys.GET_DEALS_WHITELIST, params.authToken],
    queryFn: async () => {
      const response = await fetchDealWhitelist({ authToken: params.authToken });
      return response.data;
    },
    enabled: !!params.authToken,
  });
}

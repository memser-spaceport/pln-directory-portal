import { useQuery } from '@tanstack/react-query';
import { SpvSpotlightsQueryKeys } from './constants/queryKeys';
import { fetchSpvInvestorLists } from '../../utils/services/spv-investor-lists';

export function useSpvInvestorLists(spotlightUid: string) {
  return useQuery({
    queryKey: [SpvSpotlightsQueryKeys.GET_INVESTOR_LISTS, spotlightUid],
    queryFn: () => fetchSpvInvestorLists(spotlightUid),
    enabled: !!spotlightUid,
  });
}

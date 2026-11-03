import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SpvSpotlightsQueryKeys } from './constants/queryKeys';
import { updateSpvInvestorList } from '../../utils/services/spv-investor-lists';

export function useUpdateSpvInvestorList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateSpvInvestorList,
    onSuccess: (_list, { spotlightUid }) => {
      queryClient.invalidateQueries({ queryKey: [SpvSpotlightsQueryKeys.GET_INVESTOR_LISTS, spotlightUid] });
    },
  });
}

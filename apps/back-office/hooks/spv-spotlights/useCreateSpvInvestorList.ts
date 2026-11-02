import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SpvSpotlightsQueryKeys } from './constants/queryKeys';
import { createSpvInvestorList } from '../../utils/services/spv-investor-lists';

export function useCreateSpvInvestorList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createSpvInvestorList,
    onSuccess: (_list, { spotlightUid }) => {
      queryClient.invalidateQueries({ queryKey: [SpvSpotlightsQueryKeys.GET_INVESTOR_LISTS, spotlightUid] });
    },
  });
}

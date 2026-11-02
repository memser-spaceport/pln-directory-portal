import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { SpvSpotlightsQueryKeys } from './constants/queryKeys';
import { deleteSpvInvestorList } from '../../utils/services/spv-investor-lists';

export function useDeleteSpvInvestorList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteSpvInvestorList,
    onSuccess: (_data, { spotlightUid }) => {
      queryClient.invalidateQueries({ queryKey: [SpvSpotlightsQueryKeys.GET_INVESTOR_LISTS, spotlightUid] });
      toast.success('List deleted');
    },
    onError: () => {
      toast.error('Failed to delete list');
    },
  });
}

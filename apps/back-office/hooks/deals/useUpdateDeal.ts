import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { DealsQueryKeys } from './constants/queryKeys';
import { updateDeal } from '../../utils/services/deal';
import { TDealForm } from '../../screens/deals/types/deal';

export function useUpdateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { authToken: string | undefined; uid: string; payload: Partial<TDealForm & { status: string }> }) =>
      updateDeal(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_COUNTS] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_REPORTED_ISSUES_LIST] });
      toast.success('Deal updated successfully');
    },
    onError: () => {
      toast.error('Failed to update deal');
    },
  });
}

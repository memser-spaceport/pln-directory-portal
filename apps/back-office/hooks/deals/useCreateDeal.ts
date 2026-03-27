import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { DealsQueryKeys } from './constants/queryKeys';
import { createDeal } from '../../utils/services/deal';
import { TDealForm } from '../../screens/deals/types/deal';

export function useCreateDeal() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { authToken: string | undefined; payload: TDealForm }) => createDeal(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_SUBMITTED_DEALS_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_COUNTS] });
      toast.success('Deal created successfully');
    },
    onError: () => {
      toast.error('Failed to create deal');
    },
  });
}

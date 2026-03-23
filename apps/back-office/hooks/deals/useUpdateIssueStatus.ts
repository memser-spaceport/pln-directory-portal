import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-toastify';
import { DealsQueryKeys } from './constants/queryKeys';
import { updateIssueStatus } from '../../utils/services/deal';

export function useUpdateIssueStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: { authToken: string | undefined; uid: string; status: 'OPEN' | 'RESOLVED' }) =>
      updateIssueStatus(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_REPORTED_ISSUES_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_LIST] });
      queryClient.invalidateQueries({ queryKey: [DealsQueryKeys.GET_DEALS_COUNTS] });
      toast.success(variables.status === 'RESOLVED' ? 'Issue resolved' : 'Issue reopened');
    },
    onError: () => {
      toast.error('Failed to update issue status');
    },
  });
}

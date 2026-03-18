import { useMutation, useQueryClient } from '@tanstack/react-query';
import { removeDealWhitelistMember } from '../../utils/services/deal';
import { DealsQueryKeys } from './constants/queryKeys';

interface RemoveDealWhitelistMemberParams {
  authToken: string | undefined;
  memberUid: string;
}

export function useRemoveDealWhitelistMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: RemoveDealWhitelistMemberParams) => removeDealWhitelistMember(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DealsQueryKeys.GET_DEALS_WHITELIST, variables.authToken],
      });
    },
  });
}

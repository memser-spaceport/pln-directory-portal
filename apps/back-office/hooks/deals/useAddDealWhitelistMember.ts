import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDealWhitelistMember } from '../../utils/services/deal';
import { DealsQueryKeys } from './constants/queryKeys';

interface AddDealWhitelistMemberParams {
  authToken: string | undefined;
  memberUid: string;
}

export function useAddDealWhitelistMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: AddDealWhitelistMemberParams) => addDealWhitelistMember(params),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DealsQueryKeys.GET_DEALS_WHITELIST, variables.authToken],
      });
    },
  });
}

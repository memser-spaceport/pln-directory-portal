import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from 'apps/back-office/utils/api';
import { MembersQueryKeys } from './constants/queryKeys';

async function mutation(params) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  await api.post('/v1/members/update-status', params, config);
}

export function useUpdateMembersStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_LIST],
      });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { MembersQueryKeys } from './constants/queryKeys';
import { API_ROUTE } from '../../utils/constants';

interface MutationParams {
  authToken: string;
  memberUids: string[];
  accessLevel: string;
  sendRejectEmail?: boolean;
}

async function mutation(params: MutationParams) {
  const { authToken, ...body } = params;
  const config = {
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  };

  return api.put(`${API_ROUTE.ADMIN_MEMBERS}/access-level`, body, config);
}

export function useUpdateMembersStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_LIST],
      });
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS],
      });
    },
  });
}

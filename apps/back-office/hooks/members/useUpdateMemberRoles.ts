import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MembersQueryKeys } from './constants/queryKeys';

interface MutationParams {
  authToken: string;
  memberUid: string;
  roles: string[];
}

async function mutation(params: MutationParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const body = {
    roles: params.roles,
  };

  const { data } = await api.patch(
    `${API_ROUTE.ADMIN_MEMBERS}/${params.memberUid}/roles`,
    body,
    config,
  );

  return data;
}

export function useUpdateMemberRoles() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutation,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_LIST],
      });

      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBER, variables.memberUid],
      });
    },
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MembersQueryKeys } from './constants/queryKeys';

interface MutationParams {
  authToken: string;
  memberUid: string;
  roles?: string[];
  hosts?: string[];
}

async function mutation(params: MutationParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const body: { roles?: string[]; hosts?: string[] } = {};
  if (params.roles !== undefined) {
    body.roles = params.roles;
  }
  if (params.hosts !== undefined) {
    body.hosts = params.hosts;
  }

  const { data } = await api.patch(`${API_ROUTE.ADMIN_MEMBERS}/${params.memberUid}/roles-and-hosts`, body, config);

  return data;
}

export function useUpdateMemberRolesAndHosts() {
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

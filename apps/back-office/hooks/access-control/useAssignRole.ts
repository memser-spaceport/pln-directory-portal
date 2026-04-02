import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { RbacQueryKeys } from './constants/queryKeys';

interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  roleCode: string;
  assignedByMemberUid?: string;
}

export function useAssignRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { authToken, memberUid, roleCode, assignedByMemberUid } = params;

      const { data } = await api.post(
        `${API_ROUTE.ADMIN_RBAC_ROLES}/assign`,
        {
          memberUid,
          roleCode,
          assignedByMemberUid,
        },
        {
          headers: {
            authorization: `Bearer ${authToken}`,
          },
        }
      );

      return data;
    },
    onSuccess: (_, variables) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.MEMBER_DETAILS, variables.authToken, variables.memberUid],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.MEMBERS_LIST, variables.authToken],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.ROLE_DETAILS, variables.authToken, variables.roleCode],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.ROLES_LIST, variables.authToken],
      });
    },
  });
}

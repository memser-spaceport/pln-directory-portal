import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { RbacQueryKeys } from './constants/queryKeys';

interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  permissionCode: string;
  grantedByMemberUid?: string;
}

export function useGrantPermission() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { authToken, memberUid, permissionCode, grantedByMemberUid } = params;

      const { data } = await api.post(
        `${API_ROUTE.ADMIN_RBAC_PERMISSIONS}/grant`,
        {
          memberUid,
          permissionCode,
          grantedByMemberUid,
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
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.MEMBER_DETAILS, variables.authToken, variables.memberUid],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.MEMBERS_LIST, variables.authToken],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.PERMISSION_DETAILS, variables.authToken, variables.permissionCode],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.PERMISSIONS_LIST, variables.authToken],
      });
    },
  });
}

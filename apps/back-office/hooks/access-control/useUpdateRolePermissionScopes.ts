import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { RbacQueryKeys } from './constants/queryKeys';

interface MutationParams {
  authToken: string | undefined;
  roleCode: string;
  permissionCode: string;
  scopes: string[];
}

export function useUpdateRolePermissionScopes() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { authToken, roleCode, permissionCode, scopes } = params;

      const { data } = await api.post(
        `${API_ROUTE.ADMIN_RBAC_ROLES}/permission-scopes`,
        { roleCode, permissionCode, scopes },
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
        queryKey: [RbacQueryKeys.ROLE_DETAILS, variables.authToken, variables.roleCode],
      });
      queryClient.invalidateQueries({
        queryKey: [RbacQueryKeys.ROLES_LIST, variables.authToken],
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

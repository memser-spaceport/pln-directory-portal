import { useMutation } from '@tanstack/react-query';
import api from '../../utils/api';

interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  permissionCode: string;
  grantedByUid?: string;
}

export function useGrantDirectPermissionV2() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.post(
        '/v2/admin/access-control-v2/member-permissions',
        { memberUid: params.memberUid, permissionCode: params.permissionCode, grantedByUid: params.grantedByUid },
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}

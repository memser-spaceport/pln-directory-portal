import { useMutation } from '@tanstack/react-query';
import api from '../../utils/api';

interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  policyCode: string;
}

export function useRevokePolicy() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.delete(
        `/v2/admin/access-control-v2/members/${params.memberUid}/policies/${params.policyCode}`,
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}

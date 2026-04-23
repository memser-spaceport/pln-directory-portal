import { useMutation } from '@tanstack/react-query';
import api from '../../utils/api';

interface MutationParams {
  authToken: string | undefined;
  memberUid: string;
  policyCode: string;
  assignedByUid?: string;
}

export function useAssignPolicy() {
  return useMutation({
    mutationFn: async (params: MutationParams) => {
      const { data } = await api.post(
        '/v2/admin/access-control-v2/assign-policy',
        { memberUid: params.memberUid, policyCode: params.policyCode, assignedByUid: params.assignedByUid },
        { headers: { authorization: `Bearer ${params.authToken}` } }
      );
      return data;
    },
  });
}

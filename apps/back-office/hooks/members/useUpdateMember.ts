import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { MembersQueryKeys } from './constants/queryKeys';

interface MutationParams {
  uid: string;
  payload: any;
}

async function mutation({ uid, payload }: MutationParams) {
  return await api.put(`/v1/member/${uid}`, payload);
}

export function useUpdateMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: mutation,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS],
      });

      queryClient.invalidateQueries({
        queryKey: [MembersQueryKeys.GET_MEMBERS_LIST],
      });
    },
  });
}

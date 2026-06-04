import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export function useCreateTeamPitch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ authToken, data }: { authToken: string; data: Record<string, unknown> }) => {
      const res = await api.post(API_ROUTE.ADMIN_TEAM_PITCHES, data, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TeamPitchesQueryKeys.LIST] });
    },
  });
}

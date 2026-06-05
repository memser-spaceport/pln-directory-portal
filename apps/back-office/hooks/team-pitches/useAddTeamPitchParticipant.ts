import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export function useAddTeamPitchParticipant() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      authToken,
      pitchUid,
      data,
    }: {
      authToken: string;
      pitchUid: string;
      data: Record<string, unknown>;
    }) => {
      const res = await api.post(`${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}/participants`, data, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [TeamPitchesQueryKeys.PARTICIPANTS, vars.authToken, vars.pitchUid],
      });
    },
  });
}

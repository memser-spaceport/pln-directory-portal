import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export function useSendTeamPitchFollowUp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      authToken,
      pitchUid,
      participantUid,
    }: {
      authToken: string;
      pitchUid: string;
      participantUid: string;
    }) => {
      const res = await api.post(
        `${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}/participants/${participantUid}/send-follow-up`,
        {},
        { headers: { authorization: `Bearer ${authToken}` } }
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: [TeamPitchesQueryKeys.PARTICIPANTS, vars.authToken, vars.pitchUid],
      });
    },
  });
}

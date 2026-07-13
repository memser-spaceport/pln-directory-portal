import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export type RemoveTeamPitchParticipantsBulkResponse = {
  summary: {
    total: number;
    removed: number;
    skipped: number;
  };
  rows: Array<{
    participantUid: string;
    status: 'removed' | 'skipped';
    message?: string | null;
  }>;
};

export function useRemoveTeamPitchParticipantsBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      authToken,
      pitchUid,
      participantUids,
    }: {
      authToken: string;
      pitchUid: string;
      participantUids: string[];
    }): Promise<RemoveTeamPitchParticipantsBulkResponse> => {
      const res = await api.post(
        `${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}/participants/remove-bulk`,
        { participantUids },
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

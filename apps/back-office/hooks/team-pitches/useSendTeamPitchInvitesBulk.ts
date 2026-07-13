import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export type SendTeamPitchInvitesBulkResponse = {
  summary: {
    totalEligible: number;
    sent: number;
    skipped: number;
    errors: number;
  };
  rows: Array<{
    participantUid: string;
    email: string | null;
    name: string | null;
    status: 'sent' | 'skipped' | 'error';
    message?: string | null;
  }>;
};

export function useSendTeamPitchInvitesBulk() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      authToken,
      pitchUid,
      includeAlreadyInvited,
    }: {
      authToken: string;
      pitchUid: string;
      includeAlreadyInvited: boolean;
    }): Promise<SendTeamPitchInvitesBulkResponse> => {
      const res = await api.post(
        `${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}/participants/send-invites-bulk`,
        { includeAlreadyInvited },
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

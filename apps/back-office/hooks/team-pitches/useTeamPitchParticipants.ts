import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export function useTeamPitchParticipants(
  authToken: string | undefined,
  pitchUid: string,
  type?: 'INVESTOR' | 'FOUNDER' | 'SUPPORT'
) {
  return useQuery({
    queryKey: [TeamPitchesQueryKeys.PARTICIPANTS, authToken, pitchUid, type],
    queryFn: async () => {
      const { data } = await api.get(`${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}/participants`, {
        headers: { authorization: `Bearer ${authToken}` },
        params: { type },
      });
      return data;
    },
    enabled: !!authToken && !!pitchUid,
  });
}

import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export function useTeamPitchDetail(authToken: string | undefined, pitchUid: string) {
  return useQuery({
    queryKey: [TeamPitchesQueryKeys.DETAIL, authToken, pitchUid],
    queryFn: async () => {
      const { data } = await api.get(`${API_ROUTE.ADMIN_TEAM_PITCHES}/${pitchUid}`, {
        headers: { authorization: `Bearer ${authToken}` },
      });
      return data;
    },
    enabled: !!authToken && !!pitchUid,
  });
}

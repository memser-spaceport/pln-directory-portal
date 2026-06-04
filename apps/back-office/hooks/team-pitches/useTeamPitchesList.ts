import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { TeamPitchesQueryKeys } from './constants/queryKeys';

export type TeamPitchListItem = {
  uid: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  supportEmail: string;
  createdAt: string;
  team: { uid: string; name: string; logo?: { url: string } | null };
  logoUrl: string | null;
};

type Params = {
  authToken: string | undefined;
  search?: string;
  status?: string;
};

export function useTeamPitchesList(params: Params) {
  return useQuery({
    queryKey: [TeamPitchesQueryKeys.LIST, params.authToken, params.search, params.status],
    queryFn: async () => {
      const { data } = await api.get<TeamPitchListItem[]>(API_ROUTE.ADMIN_TEAM_PITCHES, {
        headers: { authorization: `Bearer ${params.authToken}` },
        params: { search: params.search || undefined, status: params.status || undefined },
      });
      return data;
    },
    enabled: !!params.authToken,
  });
}

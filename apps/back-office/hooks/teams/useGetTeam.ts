import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';

export type TeamDetail = {
  uid: string;
  name: string;
  website?: string | null;
  blog?: string | null;
  contactMethod?: string | null;
  twitterHandler?: string | null;
  linkedinHandler?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  logo?: { url: string } | null;
};

async function fetchTeam(uid: string, authToken: string): Promise<TeamDetail> {
  const config = { headers: { authorization: `Bearer ${authToken}` } };
  const { data } = await api.get<TeamDetail>(`/v1/admin/teams/${uid}`, config);
  return data;
}

export function useGetTeam(uid: string | null, authToken: string | null | undefined) {
  return useQuery({
    queryKey: ['TEAM_DETAIL', uid],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    queryFn: () => fetchTeam(uid!, authToken!),
    enabled: !!uid && !!authToken,
    staleTime: 30_000,
  });
}

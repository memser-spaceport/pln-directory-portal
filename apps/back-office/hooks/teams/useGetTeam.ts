import { useQuery } from '@tanstack/react-query';
import publicApi from '../../utils/public-api';

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

async function fetchTeam(uid: string): Promise<TeamDetail> {
  const { data } = await publicApi.get<TeamDetail>(`/v1/teams/${uid}`);
  return data;
}

export function useGetTeam(uid: string | null, enabled = true) {
  return useQuery({
    queryKey: ['TEAM_DETAIL', uid],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    queryFn: () => fetchTeam(uid!),
    enabled: enabled && !!uid,
    staleTime: 30_000,
  });
}

import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

type ResponseCounts = {
  PENDING: number;
  VERIFIED: number;
  APPROVED: number;
  REJECTED: number;
};

async function fetcher(authToken: string) {
  const config = {
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  };

  const { data } = await api.get<ResponseCounts>(`${API_ROUTE.ADMIN_MEMBERS}/member-state-counts`, config);

  return data;
}

export function useMemberStateCounts({ authToken }: { authToken: string }) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS, authToken],
    queryFn: () => fetcher(authToken),
    enabled: !!authToken,
  });
}

export const useAccessLevelCounts = useMemberStateCounts;

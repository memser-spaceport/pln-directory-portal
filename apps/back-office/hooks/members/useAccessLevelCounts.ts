import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

type ResponseCounts = {
  L0: number;
  L1: number;
  L2: number;
  L3: number;
  L4: number;
  Rejected: number;
};

async function fetcher(authToken: string) {
  const config = {
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  };

  const { data } = await api.get<ResponseCounts>(`${API_ROUTE.ADMIN_MEMBERS}/access-level-counts`, config);

  return data;
}

export function useAccessLevelCounts({ authToken }: { authToken: string }) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBERS_ACCESS_LEVEL_COUNTS, authToken],
    queryFn: () => fetcher(authToken),
    enabled: !!authToken,
  });
}

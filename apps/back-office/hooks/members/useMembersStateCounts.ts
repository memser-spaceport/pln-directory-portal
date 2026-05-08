import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

type MemberStateCounts = {
  PENDING: number;
  VERIFIED: number;
  APPROVED: number;
  REJECTED: number;
};

const EMPTY: MemberStateCounts = { PENDING: 0, VERIFIED: 0, APPROVED: 0, REJECTED: 0 };

async function fetcher(authToken: string) {
  const { data } = await api.get<MemberStateCounts>(API_ROUTE.ADMIN_MEMBERS_COUNTS, {
    headers: { authorization: `Bearer ${authToken}` },
  });
  return data;
}

export function useMembersStateCounts({ authToken }: { authToken: string | null | undefined }) {
  const { data } = useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBERS_STATE_COUNTS, authToken],
    queryFn: () => fetcher(authToken!),
    enabled: !!authToken,
  });

  return data ?? EMPTY;
}

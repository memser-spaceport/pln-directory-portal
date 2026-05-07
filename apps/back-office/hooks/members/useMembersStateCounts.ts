import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MemberState, MemberStateCounts } from 'libs/contracts/src/schema/admin-member';

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

  return (
    data ?? {
      [MemberState.PENDING]: 0,
      [MemberState.VERIFIED]: 0,
      [MemberState.APPROVED]: 0,
      [MemberState.REJECTED]: 0,
    }
  );
}

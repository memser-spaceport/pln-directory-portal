import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MemberAccessDetails } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
  memberUid: string | undefined;
}

async function fetcher(params: QueryParams): Promise<MemberAccessDetails> {
  const { authToken, memberUid } = params;

  const { data } = await api.get<MemberAccessDetails>(
    `${API_ROUTE.ADMIN_RBAC_MEMBERS}/${memberUid}`,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacMember(params: QueryParams) {
  const { authToken, memberUid } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.MEMBER_DETAILS, authToken, memberUid],
    queryFn: () => fetcher(params),
    enabled: !!authToken && !!memberUid,
  });
}

import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { Member } from '../../screens/members/types/member';

interface QueryParams {
  authToken: string | undefined;
  accessLevel: string[];
}

async function fetcher(params: QueryParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.get<{
    data: Member[];
    pagination: { total: number; page: number; limit: number; pages: number };
  }>(`${API_ROUTE.ADMIN_MEMBERS}?accessLevel=${params.accessLevel.join(',')}`, config);

  return data;
}

export function useMembersList(params: QueryParams) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_MEMBERS_LIST, params.authToken, params.accessLevel],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken,
  });
}

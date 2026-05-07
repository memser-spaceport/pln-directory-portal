import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { Member } from '../../screens/members/types/member';

interface QueryParams {
  authToken: string | undefined;
  memberState?: string[];
  policyCodes?: string[];
  policyGroups?: string[];
  policyRoles?: string[];
  page?: number;
  limit?: number;
  search?: string;
  enabled?: boolean;
}

async function fetcher(params: QueryParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const search = new URLSearchParams();

  if (params.memberState?.length) {
    search.set('memberState', params.memberState.join(','));
  }
  if (params.policyCodes?.length) {
    search.set('policyCodes', params.policyCodes.join(','));
  }
  if (params.policyGroups?.length) {
    search.set('policyGroups', params.policyGroups.join(','));
  }
  if (params.policyRoles?.length) {
    search.set('policyRoles', params.policyRoles.join(','));
  }
  if (params.page) {
    search.set('page', String(params.page));
  }
  if (params.limit) {
    search.set('limit', String(params.limit));
  }
  if (params.search) {
    search.set('search', params.search);
  }

  const query = search.toString();

  const { data } = await api.get<{
    data: Member[];
    pagination: { total: number; page: number; limit: number; pages: number };
  }>(query ? `${API_ROUTE.ADMIN_MEMBERS}?${query}` : API_ROUTE.ADMIN_MEMBERS, config);

  return data;
}

export function useMembersList(params: QueryParams) {
  const { enabled = true } = params;
  return useQuery({
    queryKey: [
      MembersQueryKeys.GET_MEMBERS_LIST,
      params.authToken,
      params.memberState,
      params.policyCodes,
      params.policyGroups,
      params.policyRoles,
      params.page,
      params.limit,
      params.search,
    ],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken && enabled,
  });
}

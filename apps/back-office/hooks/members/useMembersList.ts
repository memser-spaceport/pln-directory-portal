import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { Member } from '../../screens/members/types/member';

export interface MembersListQueryParams {
  authToken: string | undefined;
  memberState?: string[];
  policyCodes?: string[];
  policyGroups?: string[];
  policyRoles?: string[];
  page?: number;
  limit?: number;
  /** Sent as search= (server filters name/email/uid/project name) */
  search?: string;
  sortBy?: 'updatedAt' | 'name';
  sortOrder?: 'asc' | 'desc';
}

async function fetcher(params: MembersListQueryParams) {
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
  if (params.page !== undefined) {
    search.set('page', String(params.page));
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const trimmedSearch = params.search?.trim();
  if (trimmedSearch) {
    search.set('search', trimmedSearch);
  }
  if (params.sortBy) {
    search.set('sortBy', params.sortBy);
  }
  if (params.sortOrder) {
    search.set('sortOrder', params.sortOrder);
  }

  const queryStr = search.toString();

  const { data } = await api.get<{
    data: Member[];
    pagination: { total: number; page: number; limit: number; pages: number };
  }>(queryStr ? `${API_ROUTE.ADMIN_MEMBERS}?${queryStr}` : API_ROUTE.ADMIN_MEMBERS, config);

  return data;
}

export function useMembersList(
  params: MembersListQueryParams,
  options?: { keepPrevious?: boolean; enabled?: boolean }
) {
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
      params.sortBy,
      params.sortOrder,
    ],
    queryFn: () => fetcher(params),
    enabled:
      !!params.authToken && (typeof options?.enabled === 'boolean' ? options.enabled : true),
    ...(options?.keepPrevious !== false ? { keepPreviousData: true } : {}),
  });
}

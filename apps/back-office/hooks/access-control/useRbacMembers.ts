import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MembersListResponse } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
  search?: string;
  roleCode?: string;
  excludeRoleCode?: string;
  page?: number;
  limit?: number;
  /** When false, the query does not run (e.g. modal closed). Defaults to true when authToken is set. */
  enabled?: boolean;
}

async function fetcher(params: QueryParams): Promise<MembersListResponse> {
  const { authToken, search, roleCode, excludeRoleCode, page = 1, limit = 10 } = params;

  const queryParams = new URLSearchParams();
  if (search) queryParams.set('search', search);
  if (roleCode) queryParams.set('role', roleCode);
  if (excludeRoleCode) queryParams.set('excludeRole', excludeRoleCode);
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));

  const { data } = await api.get<MembersListResponse>(
    `${API_ROUTE.ADMIN_RBAC_MEMBERS}?${queryParams.toString()}`,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacMembers(params: QueryParams) {
  const { authToken, search, roleCode, excludeRoleCode, page, limit, enabled = true } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.MEMBERS_LIST, authToken, search, roleCode, excludeRoleCode, page, limit],
    queryFn: () => fetcher(params),
    enabled: !!authToken && enabled,
  });
}

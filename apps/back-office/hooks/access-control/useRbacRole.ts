import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { RoleDetails } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
  roleCode: string | undefined;
  page?: number;
  limit?: number;
  search?: string;
}

async function fetcher(params: QueryParams): Promise<RoleDetails> {
  const { authToken, roleCode, page = 1, limit = 20, search } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (search) queryParams.set('search', search);

  const { data } = await api.get<RoleDetails>(
    `${API_ROUTE.ADMIN_RBAC_ROLES}/${roleCode}?${queryParams.toString()}`,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacRole(params: QueryParams) {
  const { authToken, roleCode, page, limit, search } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.ROLE_DETAILS, authToken, roleCode, page, limit, search],
    queryFn: () => fetcher(params),
    enabled: !!authToken && !!roleCode,
  });
}

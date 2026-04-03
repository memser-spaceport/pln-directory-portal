import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { PermissionDetails } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
  permissionCode: string | undefined;
  page?: number;
  limit?: number;
  search?: string;
  filter?: 'all' | 'direct' | 'viaRoles';
}

async function fetcher(params: QueryParams): Promise<PermissionDetails> {
  const { authToken, permissionCode, page = 1, limit = 20, search, filter } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('page', String(page));
  queryParams.set('limit', String(limit));
  if (search) queryParams.set('search', search);
  if (filter && filter !== 'all') queryParams.set('filter', filter);

  const { data } = await api.get<PermissionDetails>(
    `${API_ROUTE.ADMIN_RBAC_PERMISSIONS}/${permissionCode}?${queryParams.toString()}`,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacPermission(params: QueryParams) {
  const { authToken, permissionCode, page, limit, search, filter } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.PERMISSION_DETAILS, authToken, permissionCode, page, limit, search, filter],
    queryFn: () => fetcher(params),
    enabled: !!authToken && !!permissionCode,
  });
}

import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { PermissionWithCounts } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
}

async function fetcher(params: QueryParams): Promise<PermissionWithCounts[]> {
  const { authToken } = params;

  const { data } = await api.get<PermissionWithCounts[]>(
    API_ROUTE.ADMIN_RBAC_PERMISSIONS,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacPermissions(params: QueryParams) {
  const { authToken } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.PERMISSIONS_LIST, authToken],
    queryFn: () => fetcher(params),
    enabled: !!authToken,
  });
}

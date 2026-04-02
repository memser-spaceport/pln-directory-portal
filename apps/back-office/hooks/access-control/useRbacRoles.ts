import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { RoleWithCounts } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
}

async function fetcher(params: QueryParams): Promise<RoleWithCounts[]> {
  const { authToken } = params;

  const { data } = await api.get<RoleWithCounts[]>(
    API_ROUTE.ADMIN_RBAC_ROLES,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useRbacRoles(params: QueryParams) {
  const { authToken } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.ROLES_LIST, authToken],
    queryFn: () => fetcher(params),
    enabled: !!authToken,
  });
}

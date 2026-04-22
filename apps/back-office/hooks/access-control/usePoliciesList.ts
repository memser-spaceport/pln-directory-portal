import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';

export type PolicyPermission = {
  uid: string;
  policyUid: string;
  permissionUid: string;
  permission: { uid: string; code: string; description: string };
};

export type Policy = {
  uid: string;
  code: string;
  name: string;
  description: string | null;
  role: string;
  group: string;
  isSystem: boolean;
  policyPermissions: PolicyPermission[];
};

interface QueryParams {
  authToken: string | undefined;
}

async function fetcher(params: QueryParams): Promise<Policy[]> {
  const { data } = await api.get<Policy[]>('/v2/admin/access-control-v2/policies', {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  });
  return data;
}

export function usePoliciesList(params: QueryParams) {
  return useQuery({
    queryKey: [RbacQueryKeys.POLICIES_LIST, params.authToken],
    queryFn: () => fetcher(params),
    enabled: !!params.authToken,
  });
}

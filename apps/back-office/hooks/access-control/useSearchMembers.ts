import { useQuery } from '@tanstack/react-query';
import { RbacQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { MemberBasic } from '../../screens/access-control/types';

interface QueryParams {
  authToken: string | undefined;
  query: string;
  limit?: number;
  /** When false, search is not executed. Defaults to true when query length ≥ 2. */
  enabled?: boolean;
}

async function fetcher(params: QueryParams): Promise<MemberBasic[]> {
  const { authToken, query, limit = 20 } = params;

  const queryParams = new URLSearchParams();
  queryParams.set('q', query);
  queryParams.set('limit', String(limit));

  const { data } = await api.get<MemberBasic[]>(
    `${API_ROUTE.ADMIN_RBAC_MEMBERS}/search?${queryParams.toString()}`,
    {
      headers: {
        authorization: `Bearer ${authToken}`,
      },
    }
  );

  return data;
}

export function useSearchMembers(params: QueryParams) {
  const { authToken, query, limit, enabled = true } = params;

  return useQuery({
    queryKey: [RbacQueryKeys.MEMBER_SEARCH, authToken, query, limit],
    queryFn: () => fetcher(params),
    enabled: !!authToken && query.length >= 2 && enabled,
  });
}

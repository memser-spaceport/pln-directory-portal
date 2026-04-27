import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';

export type Policy = {
  uid: string;
  code: string;
  name: string;
  description: string | null;
  role: string;
  group: string;
  isSystem: boolean;
  permissions: string[];
  assignmentsCount: number;
  permissionsCount: number;
};

interface QueryParams {
  authToken: string | undefined;
}

export function usePoliciesList({ authToken }: QueryParams) {
  return useQuery({
    queryKey: ['POLICIES_LIST', authToken],
    queryFn: async () => {
      const { data } = await api.get<Policy[]>('/v2/admin/access-control-v2/policies', {
        headers: { authorization: `Bearer ${authToken}` },
      });
      return data;
    },
    enabled: !!authToken,
  });
}

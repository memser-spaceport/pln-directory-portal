import { useQuery } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { fetchAccessControlPermissions } from '../../utils/services/ai-app-resources';

/** Access Control V2 permissions, for publishing an app to everyone who holds one (LAB-3237). */
export function useAccessControlPermissions(params: { authToken: string | undefined; enabled?: boolean }) {
  const { authToken, enabled = true } = params;

  return useQuery({
    queryKey: [AiAppResourcesQueryKeys.ACCESS_CONTROL_PERMISSIONS, authToken],
    queryFn: () => fetchAccessControlPermissions({ authToken }),
    enabled: !!authToken && enabled,
    staleTime: 5 * 60 * 1000,
  });
}

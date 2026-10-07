import { useQuery } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { fetchAiAppsList } from '../../utils/services/ai-app-resources';

export function useAiAppsList(params: { authToken: string | undefined; enabled?: boolean }) {
  return useQuery({
    queryKey: [AiAppResourcesQueryKeys.GET_AI_APPS_LIST, params.authToken],
    queryFn: () => fetchAiAppsList({ authToken: params.authToken }),
    enabled: !!params.authToken && (params.enabled ?? true),
  });
}

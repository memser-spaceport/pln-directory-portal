import { useQuery } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { fetchAiAppResources } from '../../utils/services/ai-app-resources';
import { AiAppTarget } from '../../screens/ai-app-resources/types';

export function useAiAppResources(params: { authToken: string | undefined; target: AiAppTarget | null }) {
  const { authToken, target } = params;

  return useQuery({
    queryKey: [AiAppResourcesQueryKeys.GET_AI_APP_RESOURCES, authToken, target?.appId, target?.environment],
    queryFn: () =>
      fetchAiAppResources({
        authToken,
        appId: target?.appId ?? '',
        environment: target?.environment ?? '',
      }),
    enabled: !!authToken && !!target,
    // Always read the current value when the dialog opens; it is the source of truth after save/reset.
    staleTime: 0,
    // A focus refetch would refill the form and drop unsaved edits.
    refetchOnWindowFocus: false,
  });
}

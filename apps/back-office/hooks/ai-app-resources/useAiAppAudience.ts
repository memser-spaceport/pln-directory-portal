import { useQuery } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { fetchAiAppAudience } from '../../utils/services/ai-app-resources';
import { getApiErrorStatus } from '../../screens/ai-app-resources/utils';

export function useAiAppAudience(params: { authToken: string | undefined; appId: string | null }) {
  const { authToken, appId } = params;

  return useQuery({
    queryKey: [AiAppResourcesQueryKeys.GET_AI_APP_AUDIENCE, authToken, appId],
    queryFn: () => fetchAiAppAudience({ authToken, appId: appId ?? '' }),
    enabled: !!authToken && !!appId,
    // A 4xx answer (404: the Directory does not track this app, 403: not a Directory admin) will not change on retry.
    retry: (failureCount, error) => {
      const status = getApiErrorStatus(error) ?? 0;
      return !(status >= 400 && status < 500) && failureCount < 3;
    },
    // Always read the current value when the dialog opens; it is the source of truth after save.
    staleTime: 0,
    // A focus refetch would refill the selection and drop unsaved edits.
    refetchOnWindowFocus: false,
  });
}

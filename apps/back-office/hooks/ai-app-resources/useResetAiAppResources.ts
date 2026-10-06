import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { resetAiAppResources } from '../../utils/services/ai-app-resources';
import { AiAppTarget } from '../../screens/ai-app-resources/types';

interface ResetAiAppResourcesParams extends AiAppTarget {
  authToken: string | undefined;
}

export function useResetAiAppResources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: ResetAiAppResourcesParams) => resetAiAppResources(params),
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: [
          AiAppResourcesQueryKeys.GET_AI_APP_RESOURCES,
          variables.authToken,
          variables.appId,
          variables.environment,
        ],
      }),
  });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { updateAiAppResources } from '../../utils/services/ai-app-resources';
import { AiAppResourceValues, AiAppTarget } from '../../screens/ai-app-resources/types';

interface UpdateAiAppResourcesParams extends AiAppTarget {
  authToken: string | undefined;
  resources: AiAppResourceValues;
}

export function useUpdateAiAppResources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateAiAppResourcesParams) => updateAiAppResources(params),
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

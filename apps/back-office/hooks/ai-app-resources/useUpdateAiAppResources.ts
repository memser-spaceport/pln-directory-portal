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
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: [
            AiAppResourcesQueryKeys.GET_AI_APP_RESOURCES,
            variables.authToken,
            variables.appId,
            variables.environment,
          ],
        }),
        // A resource change can redeploy the app, so its status in the list can change too.
        queryClient.invalidateQueries({ queryKey: [AiAppResourcesQueryKeys.GET_AI_APPS_LIST, variables.authToken] }),
      ]),
  });
}

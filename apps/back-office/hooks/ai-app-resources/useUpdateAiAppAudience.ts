import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AiAppResourcesQueryKeys } from './constants/queryKeys';
import { updateAiAppAudience } from '../../utils/services/ai-app-resources';
import type { AiAppAudienceUpdate } from '../../screens/ai-app-resources/types';

type UpdateAiAppAudienceParams = { authToken: string | undefined; appId: string } & AiAppAudienceUpdate;

export function useUpdateAiAppAudience() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: UpdateAiAppAudienceParams) => updateAiAppAudience(params),
    onSuccess: (_, variables) =>
      queryClient.invalidateQueries({
        queryKey: [AiAppResourcesQueryKeys.GET_AI_APP_AUDIENCE, variables.authToken, variables.appId],
      }),
  });
}

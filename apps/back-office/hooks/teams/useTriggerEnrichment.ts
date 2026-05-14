import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { TeamsQueryKeys } from './constants/queryKeys';

type TriggerResponse = {
  success: boolean;
  message: string;
  triggered?: number;
  skipped?: number;
};

async function triggerEnrichment(authToken: string): Promise<TriggerResponse> {
  const config = { headers: { authorization: `Bearer ${authToken}` } };
  const { data } = await api.post<TriggerResponse>('/v1/admin/teams/trigger-enrichment', {}, config);
  return data;
}

export function useTriggerEnrichment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerEnrichment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TeamsQueryKeys.ENRICHMENT_REVIEW] });
    },
  });
}

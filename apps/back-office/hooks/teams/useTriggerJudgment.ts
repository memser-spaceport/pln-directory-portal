import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { TeamsQueryKeys } from './constants/queryKeys';

type TriggerResponse = {
  success: boolean;
  message: string;
  triggered?: number;
  skipped?: number;
};

async function triggerJudgment(authToken: string): Promise<TriggerResponse> {
  const config = { headers: { authorization: `Bearer ${authToken}` } };
  const { data } = await api.post<TriggerResponse>('/v1/admin/teams/trigger-judgment', {}, config);
  return data;
}

export function useTriggerJudgment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: triggerJudgment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [TeamsQueryKeys.ENRICHMENT_REVIEW] });
    },
  });
}

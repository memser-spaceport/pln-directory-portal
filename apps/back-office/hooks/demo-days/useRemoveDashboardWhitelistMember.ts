import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  memberUid: string;
}

async function removeFromWhitelist(params: MutationParams): Promise<{ success: boolean }> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.delete<{ success: boolean }>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/dashboard-whitelist/${params.memberUid}`,
    config
  );
  return data;
}

export function useRemoveDashboardWhitelistMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeFromWhitelist,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DASHBOARD_WHITELIST, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

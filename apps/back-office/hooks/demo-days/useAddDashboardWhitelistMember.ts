import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  memberUid: string;
}

async function addToWhitelist(params: MutationParams): Promise<{ success: boolean }> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.post<{ success: boolean }>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/dashboard-whitelist`,
    { memberUid: params.memberUid },
    config
  );
  return data;
}

export function useAddDashboardWhitelistMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addToWhitelist,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DASHBOARD_WHITELIST, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

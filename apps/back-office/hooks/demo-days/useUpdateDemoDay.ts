import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { UpdateDemoDayDto, DemoDay } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  uid: string;
  data: UpdateDemoDayDto;
}

async function updateDemoDay(params: MutationParams): Promise<DemoDay> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const payload = {
    ...params.data,
    startDate: params.data.startDate ? new Date(params.data.startDate).toISOString() : undefined,
  };

  const { data } = await api.patch<DemoDay>(`${API_ROUTE.ADMIN_DEMO_DAYS}/${params.uid}`, payload, config);
  return data;
}

export function useUpdateDemoDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateDemoDay,
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: [DemoDaysQueryKeys.GET_DEMO_DAYS_LIST] });
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_DETAILS, variables.authToken],
      });
    },
  });
}

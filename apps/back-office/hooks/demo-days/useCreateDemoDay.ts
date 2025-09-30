import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { CreateDemoDayDto, DemoDay } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  data: CreateDemoDayDto;
}

async function createDemoDay(params: MutationParams): Promise<DemoDay> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const payload = {
    ...params.data,
    startDate: new Date(params.data.startDate).toISOString(),
  };

  const { data } = await api.post<DemoDay>(API_ROUTE.ADMIN_DEMO_DAYS, payload, config);
  return data;
}

export function useCreateDemoDay() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createDemoDay,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [DemoDaysQueryKeys.GET_DEMO_DAYS_LIST] });
    },
  });
}

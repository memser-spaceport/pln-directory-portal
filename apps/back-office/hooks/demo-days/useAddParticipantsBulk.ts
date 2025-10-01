import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { AddParticipantsBulkDto, BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  data: AddParticipantsBulkDto;
}

async function addParticipantsBulk(params: MutationParams): Promise<BulkParticipantsResponse> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.post<BulkParticipantsResponse>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/participants-bulk`,
    params.data,
    config
  );
  return data;
}

export function useAddParticipantsBulk() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addParticipantsBulk,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

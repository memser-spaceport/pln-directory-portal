import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { AddParticipantDto, DemoDayParticipant } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  data: AddParticipantDto;
}

async function addParticipant(params: MutationParams): Promise<DemoDayParticipant> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.post<DemoDayParticipant>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/participants`,
    params.data,
    config
  );
  return data;
}

export function useAddParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addParticipant,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

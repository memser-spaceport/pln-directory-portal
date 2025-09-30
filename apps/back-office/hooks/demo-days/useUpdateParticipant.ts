import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { UpdateParticipantDto, DemoDayParticipant } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  participantUid: string;
  data: UpdateParticipantDto;
}

async function updateParticipant(params: MutationParams): Promise<DemoDayParticipant> {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.patch<DemoDayParticipant>(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/participants/${params.participantUid}`,
    params.data,
    config
  );
  return data;
}

export function useUpdateParticipant() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateParticipant,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

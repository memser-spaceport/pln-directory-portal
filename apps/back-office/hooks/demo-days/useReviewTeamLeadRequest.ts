import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DemoDaysQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { ReviewTeamLeadRequestDto } from '../../screens/demo-days/types/demo-day';

interface MutationParams {
  authToken: string;
  demoDayUid: string;
  participantUid: string;
  data: ReviewTeamLeadRequestDto;
}

async function reviewTeamLeadRequest(params: MutationParams) {
  const config = {
    headers: {
      authorization: `Bearer ${params.authToken}`,
    },
  };

  const { data } = await api.patch(
    `${API_ROUTE.ADMIN_DEMO_DAYS}/${params.demoDayUid}/team-lead-requests/${params.participantUid}`,
    params.data,
    config
  );
  return data;
}

export function useReviewTeamLeadRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reviewTeamLeadRequest,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_TEAM_LEAD_REQUESTS, variables.authToken, variables.demoDayUid],
      });
      queryClient.invalidateQueries({
        queryKey: [DemoDaysQueryKeys.GET_DEMO_DAY_PARTICIPANTS, variables.authToken, variables.demoDayUid],
      });
    },
  });
}

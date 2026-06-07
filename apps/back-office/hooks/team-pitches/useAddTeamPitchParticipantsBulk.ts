import { useMutation } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';
import { BulkParticipantsResponse } from '../../screens/demo-days/types/demo-day';
import { InvestorParticipantForApi } from '../../utils/investor-csv';

interface MutationParams {
  authToken: string;
  pitchUid: string;
  data: { participants: InvestorParticipantForApi[] };
}

async function addTeamPitchParticipantsBulk(params: MutationParams): Promise<BulkParticipantsResponse> {
  const { data } = await api.post<BulkParticipantsResponse>(
    `${API_ROUTE.ADMIN_TEAM_PITCHES}/${params.pitchUid}/participants-bulk`,
    params.data,
    {
      headers: {
        authorization: `Bearer ${params.authToken}`,
      },
    }
  );
  return data;
}

export function useAddTeamPitchParticipantsBulk() {
  return useMutation({
    mutationFn: addTeamPitchParticipantsBulk,
  });
}

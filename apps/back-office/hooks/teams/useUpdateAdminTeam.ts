import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { TeamsQueryKeys } from './constants/queryKeys';

export type TeamUpdatePayload = {
  website?: string;
  blog?: string;
  contactMethod?: string;
  twitterHandler?: string;
  linkedinHandler?: string;
  shortDescription?: string;
  longDescription?: string;
};

type MutationParams = {
  authToken: string;
  uid: string;
  data: TeamUpdatePayload;
};

async function updateAdminTeam(params: MutationParams): Promise<void> {
  const config = { headers: { authorization: `Bearer ${params.authToken}` } };
  await api.patch(`/v1/admin/teams/${params.uid}/full`, params.data, config);
}

export function useUpdateAdminTeam() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateAdminTeam,
    onSuccess: (_, { uid }) => {
      queryClient.invalidateQueries({ queryKey: ['TEAM_DETAIL', uid] });
      queryClient.invalidateQueries({ queryKey: [TeamsQueryKeys.ENRICHMENT_REVIEW] });
    },
  });
}

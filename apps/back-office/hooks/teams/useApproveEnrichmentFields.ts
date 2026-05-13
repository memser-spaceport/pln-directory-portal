import { useMutation } from '@tanstack/react-query';
import api from '../../utils/api';
import { FieldKey } from './useTeamsEnrichmentReview';

type MutationParams = {
  authToken: string;
  teamUid: string;
  fields: FieldKey[];
};

async function approveEnrichmentFields(params: MutationParams): Promise<void> {
  const config = { headers: { authorization: `Bearer ${params.authToken}` } };
  await api.patch(
    `/v1/admin/teams/${params.teamUid}/enrichment-review/fields`,
    { fields: params.fields },
    config
  );
}

export function useApproveEnrichmentFields() {
  return useMutation({ mutationFn: approveEnrichmentFields });
}

import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

export type InvestorProfileInput = {
  investmentFocus: string[];
  typicalCheckSize?: number;
  secRulesAccepted?: boolean;
  investInStartupStages?: string[];
  investInFundTypes?: string[];
  teamUid?: string;
  isInvestViaFund?: boolean;
};

async function upsertInvestorProfile(params: { authToken: string; memberUid: string; data: InvestorProfileInput }) {
  const { authToken, memberUid, data } = params;
  const { data: resp } = await api.put(
    `${API_ROUTE.MEMBERS}/${memberUid}/investor-profile`,
    { investorProfile: data },
    { headers: { authorization: `Bearer ${authToken}` } }
  );
  return resp;
}

export function useUpsertInvestorProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: upsertInvestorProfile,
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['member', variables.memberUid] });
      qc.invalidateQueries({ queryKey: ['members'] });
    },
  });
}

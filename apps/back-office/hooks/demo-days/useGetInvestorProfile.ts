import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

export async function fetchInvestorProfile(authToken: string, memberUid: string) {
  const { data } = await api.get(
    `${API_ROUTE.MEMBERS}/${memberUid}/investor-profile`,
    { headers: { authorization: `Bearer ${authToken}` } }
  );
  return data;
}

export function useGetInvestorProfile(authToken?: string, memberUid?: string, enabled = true) {
  return useQuery({
    queryKey: ['investorProfile', memberUid],
    queryFn: () => fetchInvestorProfile(authToken!, memberUid!),
    enabled: !!authToken && !!memberUid && enabled,
  });
}

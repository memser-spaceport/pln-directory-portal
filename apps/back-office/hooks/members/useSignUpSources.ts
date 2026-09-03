import { useQuery } from '@tanstack/react-query';
import { MembersQueryKeys } from './constants/queryKeys';
import api from '../../utils/api';
import { API_ROUTE } from '../../utils/constants';

async function fetcher(authToken: string) {
  const config = {
    headers: {
      authorization: `Bearer ${authToken}`,
    },
  };

  const { data } = await api.get<string[]>(`${API_ROUTE.ADMIN_MEMBERS}/sign-up-sources`, config);

  return data;
}

export function useSignUpSources({ authToken }: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [MembersQueryKeys.GET_SIGN_UP_SOURCES, authToken],
    queryFn: () => fetcher(authToken as string),
    enabled: !!authToken,
  });
}

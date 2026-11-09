import api from '../api';
import { API_ROUTE } from '../constants';
import type {
  LabosDigestFoundNewsPage,
  LabosDigestNewsFilters,
  LabosDigestView,
} from '../../screens/labos-digest/types';

interface AuthParams {
  authToken: string | undefined;
}

const authHeaders = (authToken: string | undefined) => ({ authorization: `Bearer ${authToken}` });

export async function fetchLabosDigest(params: AuthParams): Promise<LabosDigestView> {
  const response = await api.get<LabosDigestView>(API_ROUTE.ADMIN_LABOS_DIGEST, {
    headers: authHeaders(params.authToken),
  });
  return response.data;
}

export async function saveLabosDigestPicks(params: AuthParams & { newsItemUids: string[] }): Promise<LabosDigestView> {
  const response = await api.put<LabosDigestView>(
    `${API_ROUTE.ADMIN_LABOS_DIGEST}/picks`,
    { newsItemUids: params.newsItemUids },
    { headers: authHeaders(params.authToken) }
  );
  return response.data;
}

export async function resetLabosDigestPicks(params: AuthParams): Promise<LabosDigestView> {
  const response = await api.delete<LabosDigestView>(`${API_ROUTE.ADMIN_LABOS_DIGEST}/picks`, {
    headers: authHeaders(params.authToken),
  });
  return response.data;
}

export async function fetchLabosDigestNews(
  params: AuthParams & LabosDigestNewsFilters
): Promise<LabosDigestFoundNewsPage> {
  const response = await api.get<LabosDigestFoundNewsPage>(`${API_ROUTE.ADMIN_LABOS_DIGEST}/news`, {
    headers: authHeaders(params.authToken),
    params: {
      page: params.page,
      limit: 20,
      from: params.from || undefined,
      to: params.to || undefined,
      tags: params.tags || undefined,
      q: params.q || undefined,
    },
  });
  return response.data;
}

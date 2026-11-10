import api from '../api';
import { API_ROUTE } from '../constants';
import type {
  LabosDigestFoundNewsPage,
  LabosDigestNewsDetail,
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

export async function fetchLabosDigestNewsItem(params: AuthParams & { uid: string }): Promise<LabosDigestNewsDetail> {
  const response = await api.get<LabosDigestNewsDetail>(
    `${API_ROUTE.ADMIN_LABOS_DIGEST}/news/${encodeURIComponent(params.uid)}`,
    { headers: authHeaders(params.authToken) }
  );
  return response.data;
}

export async function updateLabosDigestNews(
  params: AuthParams & { uid: string; title: string; summary: string; sourceUrls: string[] }
): Promise<LabosDigestNewsDetail> {
  const response = await api.patch<LabosDigestNewsDetail>(
    `${API_ROUTE.ADMIN_LABOS_DIGEST}/news/${encodeURIComponent(params.uid)}`,
    { title: params.title, summary: params.summary, sourceUrls: params.sourceUrls },
    { headers: authHeaders(params.authToken) }
  );
  return response.data;
}

export async function postLabosDigestNews(
  params: AuthParams & { teamUid: string; title: string; body: string; url: string }
): Promise<LabosDigestNewsDetail> {
  const response = await api.post<LabosDigestNewsDetail>(
    `${API_ROUTE.ADMIN_LABOS_DIGEST}/news`,
    { teamUid: params.teamUid, title: params.title, body: params.body, url: params.url },
    { headers: authHeaders(params.authToken) }
  );
  return response.data;
}

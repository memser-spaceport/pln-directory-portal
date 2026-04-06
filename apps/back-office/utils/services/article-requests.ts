import api from '../api';
import { API_ROUTE } from '../constants';
import type { GuideArticleRequest } from '../../screens/founder-guides/types/guide-request';

interface ArticleRequestsResponse {
  page: number;
  limit: number;
  total: number;
  items: GuideArticleRequest[];
}

export async function fetchArticleRequestsList(params: {
  authToken: string | undefined;
}): Promise<{ items: GuideArticleRequest[]; total: number }> {
  const response = await api.get<ArticleRequestsResponse>(API_ROUTE.ADMIN_ARTICLE_REQUESTS, {
    headers: { authorization: `Bearer ${params.authToken}` },
    params: { limit: 1000 },
  });
  return { items: response.data.items, total: response.data.total };
}

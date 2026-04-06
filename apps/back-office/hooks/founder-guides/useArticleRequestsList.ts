import { useQuery } from '@tanstack/react-query';
import { FounderGuidesQueryKeys } from './constants/queryKeys';
import { fetchArticleRequestsList } from '../../utils/services/article-requests';

export function useArticleRequestsList(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [FounderGuidesQueryKeys.GET_ARTICLE_REQUESTS_LIST, params.authToken],
    queryFn: () => fetchArticleRequestsList(params),
    enabled: !!params.authToken,
  });
}

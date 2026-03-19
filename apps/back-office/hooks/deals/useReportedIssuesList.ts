import { useQuery } from '@tanstack/react-query';
import { DealsQueryKeys } from './constants/queryKeys';
import { fetchReportedIssues } from '../../utils/services/deal';

export function useReportedIssuesList(params: { authToken: string | undefined }) {
  return useQuery({
    queryKey: [DealsQueryKeys.GET_REPORTED_ISSUES_LIST, params.authToken],
    queryFn: () => fetchReportedIssues(params),
    enabled: true,
  });
}

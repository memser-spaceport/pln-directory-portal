import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LabosDigestQueryKeys } from './constants/queryKeys';
import {
  fetchLabosDigest,
  fetchLabosDigestNews,
  fetchLabosDigestNewsItem,
  postLabosDigestNews,
  resetLabosDigestPicks,
  saveLabosDigestPicks,
  updateLabosDigestNews,
} from '../../utils/services/labos-digest';
import type { LabosDigestNewsFilters } from '../../screens/labos-digest/types';

export function useLabosDigest(authToken: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST, authToken],
    queryFn: () => fetchLabosDigest({ authToken }),
    enabled: !!authToken && enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useLabosDigestNews(authToken: string | undefined, enabled: boolean, filters: LabosDigestNewsFilters) {
  return useQuery({
    queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST_NEWS, authToken, filters],
    queryFn: () => fetchLabosDigestNews({ authToken, ...filters }),
    enabled: !!authToken && enabled,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

export function useLabosDigestNewsItem(authToken: string | undefined, uid: string | null) {
  return useQuery({
    queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST_NEWS, authToken, 'item', uid],
    queryFn: () => fetchLabosDigestNewsItem({ authToken, uid: uid ?? '' }),
    enabled: !!authToken && !!uid,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
}

function refreshDigest(queryClient: ReturnType<typeof useQueryClient>, authToken: string | undefined) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST, authToken] }),
    queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST_NEWS, authToken] }),
  ]);
}

export function useUpdateLabosDigestNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateLabosDigestNews,
    onSuccess: (_, variables) => refreshDigest(queryClient, variables.authToken),
  });
}

export function usePostLabosDigestNews() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postLabosDigestNews,
    onSuccess: (_, variables) => refreshDigest(queryClient, variables.authToken),
  });
}

export function useSaveLabosDigestPicks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: saveLabosDigestPicks,
    onSuccess: (_, variables) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST, variables.authToken] }),
        queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST_NEWS, variables.authToken] }),
      ]),
  });
}

export function useResetLabosDigestPicks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resetLabosDigestPicks,
    onSuccess: (_, variables) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST, variables.authToken] }),
        queryClient.invalidateQueries({ queryKey: [LabosDigestQueryKeys.GET_LABOS_DIGEST_NEWS, variables.authToken] }),
      ]),
  });
}

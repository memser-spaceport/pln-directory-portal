import { useQuery } from '@tanstack/react-query';
import api from '../../utils/api';
import { TeamsQueryKeys } from './constants/queryKeys';

export type FieldKey =
  | 'website'
  | 'logo'
  | 'shortDescription'
  | 'longDescription'
  | 'contactMethod'
  | 'twitterHandler'
  | 'linkedinHandler'
  | 'blog';

export type FieldEntry = {
  content: string | string[] | { uid: string; url: string } | null;
  metadata: { source?: string; lastModifiedAt?: string };
  judgment?: { note?: string; score?: number };
  promotable: boolean;
};

export type LogoEntry = FieldEntry & {
  verification: { verdict: string; confidence: string; reason: string } | null;
};

export type EnrichmentTeam = {
  uid: string;
  name: string;
  enrichmentStatus: string;
  fields: Partial<Record<FieldKey, FieldEntry>>;
  logo?: LogoEntry;
};

type EnrichmentReviewResponse = {
  pagination: { page: number; pageSize: number; totalTeams: number; totalPages: number };
  teams: EnrichmentTeam[];
};

async function fetchEnrichmentReview(authToken: string): Promise<EnrichmentTeam[]> {
  const config = { headers: { authorization: `Bearer ${authToken}` } };
  const { data } = await api.get<EnrichmentReviewResponse>(
    '/v1/admin/teams/enrichment-review?pageSize=1000',
    config
  );
  return data.teams ?? [];
}

export function useTeamsEnrichmentReview(authToken: string | undefined | null) {
  return useQuery({
    queryKey: [TeamsQueryKeys.ENRICHMENT_REVIEW],
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    queryFn: () => fetchEnrichmentReview(authToken!),
    enabled: !!authToken,
  });
}

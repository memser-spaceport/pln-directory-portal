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

// Mirrors EnrichmentSource and FieldEnrichmentStatus enums from backend
export type FieldMetadataSource = 'ai' | 'open-graph' | 'scrapingdog';
export type FieldMetadataStatus = 'Enriched' | 'ChangedByUser' | 'CannotEnrich';
export type JudgmentVerdict = 'agrees' | 'disagrees' | 'uncertain';
export type JudgmentConfidence = 'high' | 'medium' | 'low';

export type FieldEntry = {
  content: string | string[] | { uid: string; url: string } | null;
  metadata: {
    source?: FieldMetadataSource;
    status?: FieldMetadataStatus;
    lastModifiedAt?: string;
  };
  judgment?: { note?: string; score?: number; verdict?: JudgmentVerdict; confidence?: JudgmentConfidence };
  /**
   * Opposite-side suggestion when it exists, differs from `content`, and
   * is shape-valid. `fromSide: 'enrichment'` means it's the AI candidate
   * (`content` is the user's value, status=ChangedByUser); `fromSide:
   * 'team'` means it's the literal user-typed value (`content` is the AI
   * candidate, status=Enriched after junk-override). Lets the UI render
   * both side-by-side so the admin can Apply the alternative.
   */
  alternative?: {
    content: string | string[];
    fromSide: 'team' | 'enrichment';
  };
};

export type LogoEntry = FieldEntry & {
  verification: { verdict: string; confidence: string; reason: string } | null;
};

export type EnrichmentTeam = {
  uid: string;
  name: string;
  priority: number;
  enrichmentStatus: string;
  enrichmentAt: string | null;
  judgedAt: string | null;
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

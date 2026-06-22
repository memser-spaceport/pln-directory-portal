import { PathHopNodeDto } from '../../pathfinder/dto/ingest-pathfinder.dto';

export interface LabOsProfileDto {
  type: 'member';
  uid: string;
  slug: string;
  name: string;
  email: string | null;
  lastActiveAt: string | null;
}

/**
 * Aggregated "who is this investor/LP" enrichment (bio, fund focus, AUM, thesis,
 * marquee deals) + source links for verification. Produced by the Phase-1 /
 * prestige enrichment pass and carried on InvestorOutreachRecord.rawPayload.
 */
export interface InvestorEnrichmentDto {
  bio: string | null;
  fundFocus: string | null;
  aum: string | null;
  notableInvestments: string[];
  thesis: string | null;
  /** Source URLs; bio/thesis may reference them as [1], [2]… markers. */
  sources: string[];
  enrichedVia: string | null;
  fetchedAt: string | null;
}

export interface InvestorDto {
  investorId: string;
  canonicalId: string | null;
  dedupeKey: string;
  source: string;

  firstName: string | null;
  lastName: string | null;
  email: string;
  emailStatus: string;
  linkedinUrl: string | null;

  firm: string | null;
  firmDomain: string | null;
  title: string | null;
  proximityCode: string | null;

  investorType: string;
  fundThesis: string | null;
  aumRange: string | null;
  checkSizeRange: string | null;

  stageFocus: string;
  sectorTags: string[];
  geoFocus: string | null;
  recentDeals: string[];

  outreachTouches: number;
  outreachCampaigns: string[];
  opened: number;
  clicked: number;
  registered: number;

  firstSentDate: string | null;
  lastSentDate: string | null;
  engagementTier: string;

  enrichmentStatus: string;
  enrichmentDate: string | null;
  lastEnrichmentAttempt: string | null;
  enrichmentNotes: string | null;

  tags: string[];
  labOsProfile: LabOsProfileDto | null;
  coInvestedTeamIds: string[];

  /** PL Path Finder summary, denormalized by the pathfinder ingest. Lets the
   *  list render the proximity axis without fetching the full path list.
   *  null/false until a pathfinder run has covered this investor. */
  bestProximityCode: string | null;
  hasPath: boolean;

  /** Rank-1 path warmth (0–1) for inline table display. */
  bestRouteScore?: number | null;
  /** Total computed paths in this list's targetSet (for "View all (N)"). */
  pathCount?: number | null;
  /** Rank-1 people-first route chips for the warm-intros table. */
  bestRouteNodes?: PathHopNodeDto[];

  /** Aggregated background + sources; null until enriched. */
  enrichment: InvestorEnrichmentDto | null;

  createdAt: string;
  updatedAt: string;
}

export interface PaginatedInvestorsDto {
  page: number;
  limit: number;
  total: number;
  items: InvestorDto[];
}

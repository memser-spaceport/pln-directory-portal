export interface LabOsProfileDto {
  type: 'member';
  uid: string;
  slug: string;
  name: string;
  email: string | null;
  lastActiveAt: string | null;
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

  createdAt: string;
  updatedAt: string;
}

export interface PaginatedInvestorsDto {
  page: number;
  limit: number;
  total: number;
  items: InvestorDto[];
}

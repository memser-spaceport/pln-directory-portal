import { ReviewStateDto } from './review-state.dto';

export interface FounderDto {
  founderId: string;
  dedupeKey: string;
  source: string;
  sources: string[];
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  github: string | null;
  twitter: string | null;
  linkedin: string | null;
  telegram: string | null;
  farcaster: string | null;
  website: string | null;
  org: string | null;
  team: string | null;
  teamPriority: number | null;
  bio: string | null;
  topics: string[];
  directoryMemberId: string | null;
  directoryTeamId: string | null;
  alignmentMax: number | null;
  plvsScore: number | null;
  plvsRecommendation: string | null;
  plnProximity: number | null;
  plAlignment: number | null;
  lastSignalAt: string | null;
  whyNow: string | null;
  thinEvidence: boolean | null;
  reviewState: ReviewStateDto;
  rawPayload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedFoundersDto {
  page: number;
  limit: number;
  total: number;
  items: FounderDto[];
}

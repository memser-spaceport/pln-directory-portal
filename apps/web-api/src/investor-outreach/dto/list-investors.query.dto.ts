/**
 * Query params for GET /v1/investor-outreach/investors.
 *
 * Multi-value filters are sent as CSV strings (e.g. `source=W26,OpenVC`) to match the frontend
 * service layer in `pln-directory-portal-v2/services/investors/investors.service.ts`.
 * Parsing/validation happens in the service.
 */
export class ListInvestorsQueryDto {
  q?: string;

  source?: string;
  investorType?: string;
  stageFocus?: string;
  sectorTags?: string;
  geoFocus?: string;
  emailStatus?: string;
  engagementTier?: string;
  enrichmentStatus?: string;

  inLabOs?: string;
  isCoInvestor?: string;
  coInvestedTeamId?: string;
  tags?: string;

  /** `field:asc|desc` — whitelist enforced server-side */
  sort?: string;
  page?: string;
  limit?: string;
}

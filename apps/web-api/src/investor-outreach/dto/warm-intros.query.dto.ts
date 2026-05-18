/**
 * Query params for GET /v1/investor-outreach/warm-intros.
 * teamId auto-fills stage/sectors/geo from PlPortfolioTeamMeta if present; explicit params override.
 */
export class WarmIntrosQueryDto {
  teamId?: string;
  stageFocus?: string;
  /** CSV of sector tag tokens */
  sectorTags?: string;
  checkSizeRange?: string;
  geoFocus?: string;
}

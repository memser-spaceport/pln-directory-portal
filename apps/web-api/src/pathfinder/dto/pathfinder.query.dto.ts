/**
 * PL Path Finder — read query DTOs. Query params arrive as strings and are
 * parsed in the query service (mirrors investor-outreach pagination).
 */

export class ListPathfinderPathsQueryDto {
  targetInvestorId?: string;
  targetSet?: string;
  connectorType?: string;
  page?: string;
  limit?: string;
}

export class CrosswalkReviewQueryDto {
  page?: string;
  limit?: string;
}

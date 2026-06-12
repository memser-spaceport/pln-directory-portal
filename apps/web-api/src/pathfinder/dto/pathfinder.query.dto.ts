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

/** Batch connector-lens query: which of these targets have a path routing
 *  through any of these connector node labels. POST body (id lists are too
 *  long for a query string). */
export class ConnectorMatchesDto {
  target_investor_ids?: string[];
  connector_labels?: string[];
  /** Substring match on hop-chain node labels (e.g. team name inside a longer label). */
  connector_labels_contains?: string[];
}

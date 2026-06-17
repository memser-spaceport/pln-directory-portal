/**
 * Query params for GET /v1/investor-lists/:listId/members.
 *
 * Multi-value filters arrive as CSV strings (e.g. `sectorTags=neurotech,ai`),
 * mirroring the investor-outreach list endpoint. Parsing/validation happens in
 * the service. `relationship` is a CSV of co_invested | engaged | cold.
 */
export class ListMembersQueryDto {
  q?: string;

  sectorTags?: string;
  stageFocus?: string;
  checkSizeRange?: string;

  /** CSV of co_invested | engaged | cold */
  relationship?: string;

  /**
   * Connector lens (task 04): CSV of connector labels — keep only members with a
   * warm path whose hop chain routes through a matching node label OR PL-team
   * connector name. `connectorLabels` is an exact match; `connectorLabelsContains`
   * a substring match (≥3 chars). Server-side so the filter spans the whole list,
   * not just the loaded page.
   */
  connectorLabels?: string;
  connectorLabelsContains?: string;

  page?: string;
  limit?: string;
}

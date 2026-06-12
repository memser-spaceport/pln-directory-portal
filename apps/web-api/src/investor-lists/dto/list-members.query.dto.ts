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

  page?: string;
  limit?: string;
}

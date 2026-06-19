/**
 * Investor Lists — response shapes.
 *
 * A "list" is a curated target set of investors. The list index returns a light
 * summary (with a member count); members are full InvestorDtos reused from the
 * investor-outreach mapper so they carry proximity/enrichment/co-invested data.
 */

export interface InvestorListDto {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  isGraphed: boolean;
  memberCount: number;
  /** Present only when GET /v1/investor-lists is called with ?investorId= */
  isMember?: boolean;
}

export interface InvestorListsResponseDto {
  items: InvestorListDto[];
}

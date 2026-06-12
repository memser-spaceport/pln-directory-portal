/**
 * Investor Lists — membership mutation payloads.
 */

export interface AddListMemberDto {
  /** External investor id (InvestorOutreachRecord.investorId) to add to the list. */
  investorId: string;
  note?: string;
}

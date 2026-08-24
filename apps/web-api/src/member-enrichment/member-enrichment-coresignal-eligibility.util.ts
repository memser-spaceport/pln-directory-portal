/**
 * Coresignal-eligible subset of the member-enrichment population: fund-team
 * members (same condition `MEMBER_ENRICHMENT_FILTER_IS_FUND` uses for general
 * enrichment eligibility) or team leads/founders (same predicate the marking
 * job's `FOUNDER_OR_LEAD_FILTER` uses to order founders/leads first). Operates
 * on the already-loaded member object at fetch-time — see design.md decision
 * #4 in openspec/changes/add-coresignal-member-enrichment — rather than
 * re-querying or gating at marking time.
 */
export interface CoresignalEligibilityMember {
  teamMemberRoles: Array<{
    role: string | null;
    teamLead: boolean;
    team: { isFund: boolean };
  }>;
}

export function isCoresignalEligibleMember(member: CoresignalEligibilityMember): boolean {
  return member.teamMemberRoles.some((r) => r.team.isFund || r.teamLead || (r.role ? /founder/i.test(r.role) : false));
}

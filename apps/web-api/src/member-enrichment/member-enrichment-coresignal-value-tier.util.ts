/**
 * Default value-tier heuristic for which members get Coresignal by default (`auto`
 * preference — see `MemberEnrichmentSourcePreference`). This is a DEFAULT, not a hard
 * gate: `trigger-force-profile-enrichment(-bulk)`'s `source` param can force either
 * provider for any member regardless of this heuristic.
 *
 * A member is high-value when any of:
 * - `accessLevel` is `L5` or `L6` (investor tiers — see docs/ACCESS_LEVEL_PERMISSIONS.md)
 * - they are a team lead
 * - they belong to a fund team (`Team.isFund`)
 */
export interface CoresignalValueTierMember {
  accessLevel: string | null;
  teamMemberRoles: Array<{
    teamLead: boolean;
    team: { isFund: boolean };
  }>;
}

export function isHighValueMemberForCoresignal(member: CoresignalValueTierMember): boolean {
  if (member.accessLevel === 'L5' || member.accessLevel === 'L6') return true;

  return member.teamMemberRoles.some((r) => r.teamLead || r.team.isFund);
}

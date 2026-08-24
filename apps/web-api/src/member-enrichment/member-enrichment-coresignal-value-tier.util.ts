/**
 * Default value-tier heuristic for which members get Coresignal by default (`auto`
 * preference — see `MemberEnrichmentSourcePreference`). This is a DEFAULT, not a hard
 * gate: `trigger-force-profile-enrichment(-bulk)`'s `source` param can force either
 * provider for any member regardless of this heuristic (see
 * openspec/changes/add-coresignal-member-enrichment/design.md decision on
 * "smart default vs. explicit override").
 *
 * A member is high-value when any of:
 * - `accessLevel` is `L5` or `L6` (investor tiers — see docs/ACCESS_LEVEL_PERMISSIONS.md)
 * - they are a team lead, or their role text contains "founder"
 * - they belong to a fund team (`Team.isFund`)
 * - they belong to a team whose `priority` is in `MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY`
 *   (same 1=highest/99=unassigned convention as `Team.priority` itself; independently
 *   configurable from the general `MEMBER_ENRICHMENT_FILTER_PRIORITY` eligibility filter,
 *   since one controls population inclusion and the other controls provider preference)
 */
export interface CoresignalValueTierMember {
  accessLevel: string | null;
  teamMemberRoles: Array<{
    role: string | null;
    teamLead: boolean;
    team: { isFund: boolean; priority: number };
  }>;
}

function parseValuePriorities(): number[] {
  const raw = (process.env.MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY ?? '1,2,3').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((p) => Number.parseInt(p.trim(), 10))
    .filter((p) => Number.isInteger(p));
}

export function isHighValueMemberForCoresignal(member: CoresignalValueTierMember): boolean {
  if (member.accessLevel === 'L5' || member.accessLevel === 'L6') return true;

  const valuePriorities = parseValuePriorities();
  return member.teamMemberRoles.some(
    (r) =>
      r.teamLead ||
      (r.role ? /founder/i.test(r.role) : false) ||
      r.team.isFund ||
      (valuePriorities.length > 0 && valuePriorities.includes(r.team.priority))
  );
}

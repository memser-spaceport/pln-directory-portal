import type { PrismaClient } from '@prisma/client';

/** Matches `DemoDay.host` when the demo day is Protocol Labs–hosted. */
export const PROTOCOL_LABS_DEMO_DAY_HOST = 'Protocol Labs';

/** Legacy L2 → PLN “other” unassigned policy */
export const DEMO_DAY_POLICY_L2 = 'unassigned_pln_other';

/** Legacy L4 (and migration L3/L4) → PLC “other” unassigned policy */
export const DEMO_DAY_POLICY_L4 = 'unassigned_plc_other';

export type DemoDayParticipantTypeForPolicies = 'INVESTOR' | 'FOUNDER' | 'SUPPORT';

export function investorPolicyCodeForDemoDayHost(
  host: string | null | undefined
): 'investor_pl' | 'investor_pl_crecimiento_founder_school' {
  const normalized = (host ?? '').trim().toLowerCase();
  return normalized === PROTOCOL_LABS_DEMO_DAY_HOST.trim().toLowerCase()
    ? 'investor_pl'
    : 'investor_pl_crecimiento_founder_school';
}

export async function upsertPolicyAssignmentByCode(
  db: Pick<PrismaClient, 'policy' | 'policyAssignment'>,
  memberUid: string,
  policyCode: string
): Promise<void> {
  const policy = await db.policy.findUnique({
    where: { code: policyCode },
    select: { uid: true },
  });
  if (!policy) {
    return;
  }

  await db.policyAssignment.upsert({
    where: {
      memberUid_policyUid: {
        memberUid,
        policyUid: policy.uid,
      },
    },
    update: {},
    create: {
      memberUid,
      policyUid: policy.uid,
    },
  });
}

/** Grants investor capability via policy (not direct MemberPermissionV2), scoped by demo day host (legacy L5 / part of L6). */
export async function upsertInvestorPolicyAssignmentForDemoDayHost(
  db: Pick<PrismaClient, 'policy' | 'policyAssignment'>,
  memberUid: string,
  host: string | null | undefined
): Promise<void> {
  const policyCode = investorPolicyCodeForDemoDayHost(host);
  await upsertPolicyAssignmentByCode(db, memberUid, policyCode);
}

/**
 * Maps former demo-day access-level outcomes to policy assignments:
 * - L2 → `unassigned_pln_other` (SUPPORT)
 * - L4 → `unassigned_plc_other` (FOUNDER)
 * - L5 → `investor_pl` | `investor_pl_crecimiento_founder_school` by host (INVESTOR only on investment teams)
 * - L6 → same investor policy + `unassigned_plc_other` (INVESTOR with any non–investment-team membership)
 */
export async function applyDemoDayParticipantPolicyAssignments(
  db: Pick<PrismaClient, 'policy' | 'policyAssignment' | 'teamMemberRole'>,
  memberUid: string,
  participantType: DemoDayParticipantTypeForPolicies,
  demoDayHost: string | null | undefined,
  options?: { teamMemberRoles?: Array<{ investmentTeam: boolean | null }> }
): Promise<void> {
  switch (participantType) {
    case 'SUPPORT':
      await upsertPolicyAssignmentByCode(db, memberUid, DEMO_DAY_POLICY_L2);
      return;
    case 'FOUNDER':
      await upsertPolicyAssignmentByCode(db, memberUid, DEMO_DAY_POLICY_L4);
      return;
    case 'INVESTOR':
      await upsertInvestorPolicyAssignmentForDemoDayHost(db, memberUid, demoDayHost);
      let roles = options?.teamMemberRoles;
      if (roles === undefined) {
        roles = await db.teamMemberRole.findMany({
          where: { memberUid },
          select: { investmentTeam: true },
        });
      }
      const hasOtherRole = roles.some((r) => r.investmentTeam !== true);
      if (hasOtherRole) {
        await upsertPolicyAssignmentByCode(db, memberUid, DEMO_DAY_POLICY_L4);
      }
      return;
    default:
      return;
  }
}

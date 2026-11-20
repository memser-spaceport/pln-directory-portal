import type { TMemberForm } from '../types/member';
import { JOB_ASPIRANT_POLICY_CODE } from '../../../utils/constants';

type MemberStateValue = NonNullable<TMemberForm['memberStateStatus']>['value'];

// Job-board sign-ups are Pending members with the Job Aspirant policy, so a member who is not yet
// Approved keeps it. Rejecting soft-deletes the member, so a Rejected member keeps no policies.
export function filterPoliciesForMemberState<T extends { value: string }>(
  policies: T[],
  memberState: MemberStateValue | undefined
): T[] {
  if (memberState === 'Approved') return policies;
  if (memberState === 'Rejected') return [];
  return policies.filter((policy) => policy.value === JOB_ASPIRANT_POLICY_CODE);
}

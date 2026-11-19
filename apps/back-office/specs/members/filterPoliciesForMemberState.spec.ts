import { JOB_ASPIRANT_POLICY_CODE } from '../../utils/constants';
import { filterPoliciesForMemberState } from '../../screens/members/utils/filterPoliciesForMemberState';

const jobAspirant = { label: 'Job Aspirant', value: JOB_ASPIRANT_POLICY_CODE };
const founder = { label: 'Founder', value: 'founder_default' };

describe('filterPoliciesForMemberState', () => {
  it('keeps every policy for an Approved member', () => {
    expect(filterPoliciesForMemberState([founder, jobAspirant], 'Approved')).toEqual([founder, jobAspirant]);
  });

  it.each(['Pending', 'Verified'] as const)('keeps only the Job Aspirant policy for a %s member', (state) => {
    expect(filterPoliciesForMemberState([founder, jobAspirant], state)).toEqual([jobAspirant]);
  });

  it('keeps no policies for a Rejected member', () => {
    expect(filterPoliciesForMemberState([founder, jobAspirant], 'Rejected')).toEqual([]);
  });

  it('returns no policies for a Pending member without Job Aspirant', () => {
    expect(filterPoliciesForMemberState([founder], 'Pending')).toEqual([]);
  });
});

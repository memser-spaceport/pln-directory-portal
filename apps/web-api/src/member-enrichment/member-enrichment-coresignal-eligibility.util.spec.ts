import { isCoresignalEligibleMember } from './member-enrichment-coresignal-eligibility.util';

describe('isCoresignalEligibleMember', () => {
  it('is eligible when a TeamMemberRole is on a fund team', () => {
    expect(
      isCoresignalEligibleMember({
        teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: true } }],
      })
    ).toBe(true);
  });

  it('is eligible when a TeamMemberRole has teamLead: true', () => {
    expect(
      isCoresignalEligibleMember({
        teamMemberRoles: [{ role: 'Engineer', teamLead: true, team: { isFund: false } }],
      })
    ).toBe(true);
  });

  it('is eligible when a role contains "founder" (case-insensitive)', () => {
    expect(
      isCoresignalEligibleMember({
        teamMemberRoles: [{ role: 'Co-Founder', teamLead: false, team: { isFund: false } }],
      })
    ).toBe(true);
  });

  it('is not eligible for an ordinary member (no fund team, not a lead/founder)', () => {
    expect(
      isCoresignalEligibleMember({
        teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false } }],
      })
    ).toBe(false);
  });

  it('is not eligible when there are no team roles at all', () => {
    expect(isCoresignalEligibleMember({ teamMemberRoles: [] })).toBe(false);
  });
});

import { isHighValueMemberForCoresignal } from './member-enrichment-coresignal-value-tier.util';

describe('isHighValueMemberForCoresignal', () => {
  const member = (overrides: Partial<any> = {}) => ({
    accessLevel: null,
    teamMemberRoles: [],
    ...overrides,
  });

  it('is high-value when accessLevel is L5', () => {
    expect(isHighValueMemberForCoresignal(member({ accessLevel: 'L5' }))).toBe(true);
  });

  it('is high-value when accessLevel is L6', () => {
    expect(isHighValueMemberForCoresignal(member({ accessLevel: 'L6' }))).toBe(true);
  });

  it('is not high-value for other access levels', () => {
    expect(isHighValueMemberForCoresignal(member({ accessLevel: 'L2' }))).toBe(false);
    expect(isHighValueMemberForCoresignal(member({ accessLevel: 'L4' }))).toBe(false);
  });

  it('is high-value when a TeamMemberRole has teamLead: true', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: true, team: { isFund: false } }] })
      )
    ).toBe(true);
  });

  it('is high-value when a role contains "founder" (case-insensitive)', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Co-Founder', teamLead: false, team: { isFund: false } }] })
      )
    ).toBe(true);
  });

  it('is high-value when on a fund team', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: true } }] })
      )
    ).toBe(true);
  });

  it('is not high-value for an ordinary member on a non-fund team', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false } }] })
      )
    ).toBe(false);
  });

  it('is not high-value when there are no team roles at all and no L5/L6 access level', () => {
    expect(isHighValueMemberForCoresignal(member())).toBe(false);
  });
});

import { isHighValueMemberForCoresignal } from './member-enrichment-coresignal-value-tier.util';

describe('isHighValueMemberForCoresignal', () => {
  const ORIGINAL_ENV = { ...process.env };
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

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
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: true, team: { isFund: false, priority: 99 } }] })
      )
    ).toBe(true);
  });

  it('is high-value when a role contains "founder" (case-insensitive)', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Co-Founder', teamLead: false, team: { isFund: false, priority: 99 } }] })
      )
    ).toBe(true);
  });

  it('is high-value when on a fund team', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: true, priority: 99 } }] })
      )
    ).toBe(true);
  });

  it('is high-value when on a team whose priority is in the default value-priority list (1,2,3)', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false, priority: 1 } }] })
      )
    ).toBe(true);
  });

  it('respects a custom MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY list', () => {
    process.env.MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY = '5';
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false, priority: 1 } }] })
      )
    ).toBe(false);
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false, priority: 5 } }] })
      )
    ).toBe(true);
  });

  it('treats an empty MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY as disabling the priority criterion', () => {
    process.env.MEMBER_ENRICHMENT_CORESIGNAL_VALUE_PRIORITY = '';
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false, priority: 1 } }] })
      )
    ).toBe(false);
  });

  it('is not high-value for an ordinary member on an unpriotized, non-fund team', () => {
    expect(
      isHighValueMemberForCoresignal(
        member({ teamMemberRoles: [{ role: 'Engineer', teamLead: false, team: { isFund: false, priority: 99 } }] })
      )
    ).toBe(false);
  });

  it('is not high-value when there are no team roles at all and no L5/L6 access level', () => {
    expect(isHighValueMemberForCoresignal(member())).toBe(false);
  });
});

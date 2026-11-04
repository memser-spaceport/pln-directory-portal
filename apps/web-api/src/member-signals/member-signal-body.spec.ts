import { MemberSignalBodySchema } from 'libs/contracts/src/schema/member-signal';

describe('MemberSignalBodySchema (LAB-3123)', () => {
  const ok = (action: string, entityType: string) =>
    MemberSignalBodySchema.safeParse({ action, entityType, entityId: 'uid-1' }).success;

  it.each([
    ['view', 'member'],
    ['view', 'team'],
    ['view', 'project'],
    ['search-result-click', 'member'],
    ['search-result-click', 'team'],
    ['search-result-click', 'project'],
    ['contact-click', 'member'],
    ['contact-copy', 'member'],
    ['github-project-click', 'member'],
    ['team-contact-click', 'team'],
    ['project-link-click', 'project'],
  ])('accepts %s on %s', (action, entityType) => {
    expect(ok(action, entityType)).toBe(true);
  });

  it.each([
    ['contact-copy', 'team'],
    ['contact-click', 'project'],
    ['github-project-click', 'team'],
    ['team-contact-click', 'member'],
    ['project-link-click', 'team'],
    ['follow', 'team'],
    ['view', 'news'],
  ])('refuses %s on %s', (action, entityType) => {
    expect(ok(action, entityType)).toBe(false);
  });

  it('refuses an empty, blank or over-long entityId, and extra fields', () => {
    expect(MemberSignalBodySchema.safeParse({ action: 'view', entityType: 'team', entityId: '' }).success).toBe(false);
    expect(MemberSignalBodySchema.safeParse({ action: 'view', entityType: 'team', entityId: '  ' }).success).toBe(
      false
    );
    expect(
      MemberSignalBodySchema.safeParse({ action: 'view', entityType: 'team', entityId: 'x'.repeat(65) }).success
    ).toBe(false);
    expect(
      MemberSignalBodySchema.safeParse({ action: 'view', entityType: 'team', entityId: 'x'.repeat(64) }).success
    ).toBe(true);
    expect(
      MemberSignalBodySchema.safeParse({ action: 'view', entityType: 'team', entityId: 't1', memberUid: 'm9' }).success
    ).toBe(false);
  });
});

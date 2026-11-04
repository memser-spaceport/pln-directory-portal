import { excludedMemberWhere, isExcludedMember } from './member-exclusion';

describe('isExcludedMember', () => {
  it('excludes trending-seed bots', () => {
    expect(isExcludedMember({ signUpSource: 'system-trending-seed', email: 'bot@example.com' })).toBe(true);
  });

  it('excludes test-account email domains, case-insensitively', () => {
    expect(isExcludedMember({ email: 'qa@yopmail.com' })).toBe(true);
    expect(isExcludedMember({ email: 'QA@YopMail.com' })).toBe(true);
  });

  it('keeps normal members, including spv/demoday sign-ups and members without email', () => {
    expect(isExcludedMember({ signUpSource: 'spv-acme', email: 'a@protocol.ai' })).toBe(false);
    expect(isExcludedMember({ signUpSource: 'demoday-x', email: null })).toBe(false);
    expect(isExcludedMember({})).toBe(false);
  });

  it('treats a missing member as excluded', () => {
    expect(isExcludedMember(null)).toBe(true);
  });

  it('builds a null-safe Prisma filter to use under NOT', () => {
    expect(excludedMemberWhere()).toEqual({
      OR: [
        { AND: [{ signUpSource: { not: null } }, { signUpSource: 'system-trending-seed' }] },
        { AND: [{ email: { not: null } }, { email: { endsWith: '@yopmail.com', mode: 'insensitive' } }] },
      ],
    });
  });
});

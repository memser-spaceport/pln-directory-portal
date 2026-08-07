import {
  sanitizeMemberContactsForViewer,
  sanitizeMembersContactsForViewer,
  MEMBER_CONTACT_FIELDS,
} from './member-contact-sanitizer';

describe('member-contact-sanitizer', () => {
  const member = {
    uid: 'abc',
    name: 'Ada',
    email: 'ada@example.com',
    githubHandler: 'ada',
    discordHandler: 'ada#1',
    telegramHandler: 'ada_tg',
    telegramUid: '123',
    twitterHandler: 'ada_x',
    linkedinHandler: 'ada-li',
    bio: 'public bio',
    officeHours: 'https://cal.com/ada',
  };

  it('returns contacts unchanged when authenticated', () => {
    expect(sanitizeMemberContactsForViewer(member, true)).toEqual(member);
  });

  it('nulls contact fields when unauthenticated', () => {
    const result = sanitizeMemberContactsForViewer(member, false);
    expect(result.uid).toBe('abc');
    expect(result.name).toBe('Ada');
    expect(result.bio).toBe('public bio');
    expect(result.officeHours).toBe('https://cal.com/ada');
    for (const field of MEMBER_CONTACT_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });

  it('sanitizes member lists when unauthenticated', () => {
    const result = sanitizeMembersContactsForViewer([member], false);
    expect(result[0].email).toBeNull();
    expect(result[0].name).toBe('Ada');
  });
});

import {
  sanitizeMemberContactsForViewer,
  sanitizeMembersContactsForViewer,
  MEMBER_CONTACT_FIELDS,
  MEMBER_PRIVATE_FIELDS,
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
    preferences: { showEmail: true },
    linkedInDetails: { headline: 'Engineer' },
    moreDetails: 'private notes',
    aboutYou: 'more private notes',
    accessLevel: 'L4',
    linkedinProfile: { linkedinHandler: 'ada-li', profileData: { headline: 'Engineer' } },
  };

  it('returns contacts unchanged when authenticated', () => {
    expect(sanitizeMemberContactsForViewer(member, true)).toEqual(member);
  });

  it('nulls contact fields when unauthenticated', () => {
    const result: any = sanitizeMemberContactsForViewer(member, false);
    expect(result.uid).toBe('abc');
    expect(result.name).toBe('Ada');
    expect(result.bio).toBe('public bio');
    for (const field of MEMBER_CONTACT_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });

  it('nulls officeHours when unauthenticated', () => {
    const result: any = sanitizeMemberContactsForViewer(member, false);
    expect(result.officeHours).toBeNull();
  });

  it('nulls private fields when unauthenticated', () => {
    const result: any = sanitizeMemberContactsForViewer(member, false);
    for (const field of MEMBER_PRIVATE_FIELDS) {
      expect(result[field]).toBeNull();
    }
  });

  it('nulls the whole linkedinProfile object when unauthenticated', () => {
    const result: any = sanitizeMemberContactsForViewer(member, false);
    expect(result.linkedinProfile).toBeNull();
  });

  it('sanitizes member lists when unauthenticated', () => {
    const result = sanitizeMembersContactsForViewer([member], false);
    expect(result[0].email).toBeNull();
    expect(result[0].name).toBe('Ada');
  });

  it('strips contact/private fields from a nested member-like object behind any relation key', () => {
    const payload = {
      uid: 'team-1',
      name: 'Team A',
      teamMemberRoles: [{ role: 'lead', member: { ...member } }],
      creator: { ...member },
      closedBy: { ...member },
    };
    const result: any = sanitizeMemberContactsForViewer(payload, false);
    expect(result.name).toBe('Team A');
    expect(result.teamMemberRoles[0].role).toBe('lead');
    expect(result.teamMemberRoles[0].member.email).toBeNull();
    expect(result.creator.email).toBeNull();
    expect(result.creator.accessLevel).toBeNull();
    expect(result.closedBy.linkedinProfile).toBeNull();
  });

  it('leaves non-member nested objects and non-plain values untouched', () => {
    const date = new Date('2024-01-01T00:00:00.000Z');
    const payload = {
      uid: 'sub-1',
      createdAt: date,
      settings: { theme: 'dark' },
      member,
    };
    const result: any = sanitizeMemberContactsForViewer(payload, false);
    expect(result.createdAt).toBe(date);
    expect(result.settings).toEqual({ theme: 'dark' });
    expect(result.member.email).toBeNull();
  });

  it('passes payloads with no member-like node through unchanged (aside from cloning)', () => {
    const payload = { uid: 'x', name: 'no member here' };
    expect(sanitizeMemberContactsForViewer(payload, false)).toEqual(payload);
  });
});

import { mapEventColumns, toEventAccess, toEventFormat, toEventTagNames } from './pl-event-columns.mapper';

describe('mapEventColumns', () => {
  it('reads the events service spellings', () => {
    expect(
      mapEventColumns({
        format: 'IN-PERSON',
        access_option: 'PAID',
        timezone: 'Asia/Tokyo',
        tags: ['Crypto', { name: 'AI', color: '#fff' }, 'Crypto', '  '],
        host: ' Protocol Labs ',
        registration_link: 'https://lu.ma/abc',
        meeting_link: 'javascript:alert(1)',
        address_info: { address: 'Shibuya 1-1', latitude: '35.66', longitude: 139.7 },
      })
    ).toEqual({
      timezone: 'Asia/Tokyo',
      format: 'IN_PERSON',
      accessOption: 'PAID',
      tags: ['Crypto', 'AI'],
      hostName: 'Protocol Labs',
      venueAddress: 'Shibuya 1-1',
      latitude: 35.66,
      longitude: 139.7,
      registrationUrl: 'https://lu.ma/abc',
      meetingUrl: null,
    });
  });

  it('reads an event with none of the fields, or odd values, as empty columns', () => {
    const empty = {
      timezone: null,
      format: null,
      accessOption: null,
      tags: [],
      hostName: null,
      venueAddress: null,
      latitude: null,
      longitude: null,
      registrationUrl: null,
      meetingUrl: null,
    };
    expect(mapEventColumns({})).toEqual(empty);
    expect(mapEventColumns(null)).toEqual(empty);
    expect(
      mapEventColumns({
        format: 'ON THE MOON',
        access_option: 'Free w/ RSVP',
        timezone: 'Mars/Olympus',
        tags: 'AI',
        host: 7,
        address_info: { latitude: 400, longitude: 'east' },
      })
    ).toEqual(empty);
  });

  it('normalizes format, access and tags', () => {
    expect(toEventFormat('hybrid')).toBe('HYBRID');
    expect(toEventFormat('In Person')).toBe('IN_PERSON');
    expect(toEventAccess('invite')).toBe('INVITE');
    expect(toEventAccess('INVITE_ONLY')).toBeNull();
    expect(toEventTagNames([{ name: 'A' }, 'B', { color: 'x' }])).toEqual(['A', 'B']);
  });
});

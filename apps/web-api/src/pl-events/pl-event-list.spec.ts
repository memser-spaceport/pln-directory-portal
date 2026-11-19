// Loading the real collaborators makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed here,
// as in pl-event-detail.spec.ts. PLEventsService is real.
jest.mock('./pl-event-guests.service', () => ({ PLEventGuestsService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationService: class {} }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('../events/events-tooling.service', () => ({ EventsToolingService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));

import { BadRequestException } from '@nestjs/common';
import { ResponsePLEventListSchema } from 'libs/contracts/src/schema/pl-event-list';
import { InMemoryPrisma, InMemoryTables } from './fixtures/in-memory-prisma';
import { attendanceByEvent, eventListWhere, parseEventListQuery } from './pl-event-list';
import { PLEventsService } from './pl-events.service';

/** LAB-3281: `GET /v1/irl/events`. */

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const inDays = (days: number) => new Date(NOW + days * DAY);

let seq = 0;
function event(uid: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return {
    uid,
    name: `Event ${uid}`,
    slugURL: uid,
    type: 'IN_PERSON',
    startDate: inDays(seq),
    endDate: inDays(seq + 1),
    isAllDay: false,
    timezone: null,
    format: 'IN_PERSON',
    accessOption: 'OPEN',
    tags: [],
    isFeatured: false,
    hostName: null,
    venueAddress: null,
    latitude: null,
    longitude: null,
    externalId: null,
    websiteURL: null,
    locationUid: null,
    logoUid: null,
    bannerUid: null,
    additionalInfo: null,
    ...extra,
  };
}

const LOCATIONS = [
  { uid: 'loc-lisbon', location: 'Lisbon, Portugal', country: 'Portugal', flag: '🇵🇹', timezone: 'Europe/Lisbon' },
  { uid: 'loc-denver', location: 'Denver, United States', country: null, flag: '🇺🇸', timezone: 'America/Denver' },
];

const member = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid,
  name: `Name ${uid}`,
  image: { url: `https://img/${uid}.png` },
  ...extra,
});

let guestSeq = 0;
function guest(memberUid: string, eventUid: string) {
  guestSeq += 1;
  return { uid: `g-${guestSeq}`, memberUid, eventUid, createdAt: new Date(NOW - 1000 * (1000 - guestSeq)) };
}

function serviceOver(tables: InMemoryTables) {
  const prisma = new InMemoryPrisma({ pLEventLocation: LOCATIONS, ...tables }).client();
  const service = new PLEventsService(
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return service;
}

async function list(
  tables: InMemoryTables,
  query: Record<string, unknown> = {},
  viewer: { uid: string } | null = null
) {
  const result = await serviceOver(tables).listPLEvents(parseEventListQuery(query), viewer);
  expect(ResponsePLEventListSchema.safeParse(result).success).toBe(true);
  return result;
}

const uids = (result: { items: Array<{ uid: string }> }) => result.items.map((item) => item.uid);

describe('parseEventListQuery', () => {
  it('applies the defaults', () => {
    expect(parseEventListQuery(undefined)).toEqual({ page: 1, limit: 50 });
    expect(parseEventListQuery({ search: '  ' })).toEqual({ page: 1, limit: 50 });
  });

  it('reads one value or several', () => {
    expect(
      parseEventListQuery({
        page: '2',
        limit: '100',
        search: ' dev ',
        city: ['Lisbon', 'Denver', 'Lisbon'],
        format: 'IN_PERSON',
        accessOption: ['OPEN', 'PAID'],
        tag: 'AI',
        host: 'Protocol Labs',
        featured: 'true',
        going: 'true',
        from: '2026-07-01',
        to: '2026-07-31',
      })
    ).toEqual({
      page: 2,
      limit: 100,
      search: 'dev',
      cities: ['Lisbon', 'Denver'],
      formats: ['IN_PERSON'],
      accessOptions: ['OPEN', 'PAID'],
      tags: ['AI'],
      hosts: ['Protocol Labs'],
      featured: true,
      going: true,
      from: new Date('2026-07-01T00:00:00.000Z'),
      to: new Date('2026-07-31T23:59:59.999Z'),
    });
  });

  it('refuses a limit over 100 and other values it cannot honour', () => {
    for (const bad of [
      { limit: '500' },
      { limit: '101' },
      { limit: '0' },
      { page: '0' },
      { page: 'x' },
      { format: 'ON_THE_MOON' },
      { format: ['IN_PERSON', 'nope'] },
      { accessOption: 'FREE' },
      { featured: 'yes' },
      { going: '1' },
      { from: 'last week' },
      { to: '2026-13-45' },
      { from: '2026-08-01', to: '2026-07-01' },
      { search: ['a', 'b'] },
      { city: { $ne: 'x' } },
    ]) {
      expect(() => parseEventListQuery(bad)).toThrow(BadRequestException);
    }
  });
});

describe('PLEventsService.listPLEvents', () => {
  beforeEach(() => {
    seq = 0;
    guestSeq = 0;
  });

  it('lists events that have not ended, earliest first, with the paging envelope', async () => {
    const result = await list({
      pLEvent: [
        event('later', { startDate: inDays(9), endDate: inDays(10) }),
        event('ended', { startDate: inDays(-5), endDate: inDays(-4) }),
        event('running', { startDate: inDays(-1), endDate: inDays(1) }),
        event('soon', { startDate: inDays(2), endDate: inDays(3) }),
      ],
    });
    expect(result).toMatchObject({ page: 1, limit: 50, total: 3 });
    expect(uids(result)).toEqual(['running', 'soon', 'later']);
  });

  it('returns the second page', async () => {
    const events = Array.from({ length: 60 }, (_, i) => event(`e${String(i).padStart(2, '0')}`));
    const result = await list({ pLEvent: events }, { page: '2', limit: '50' });
    expect(result.total).toBe(60);
    expect(result.items).toHaveLength(10);
    expect(result.items[0].uid).toBe('e50');
  });

  it('leaves out events that are not approved or are deleted', async () => {
    const result = await list({
      pLEvent: [
        event('approved'),
        event('pending', { status: 'PENDING' }),
        event('rejected', { status: 'REJECTED' }),
        event('draft', { status: 'DRAFT' }),
        event('deleted', { isDeleted: true }),
      ],
    });
    expect(uids(result)).toEqual(['approved']);
    expect(result.total).toBe(1);
  });

  it('filters by city and format: any value of one filter, all filters together', async () => {
    const tables = {
      pLEvent: [
        event('lisbon', { locationUid: 'loc-lisbon' }),
        event('denver', { locationUid: 'loc-denver' }),
        event('virtual', { format: 'VIRTUAL', type: 'VIRTUAL' }),
        event('lisbon-hybrid', { locationUid: 'loc-lisbon', format: 'HYBRID' }),
      ],
    };
    expect(uids(await list(tables, { city: ['Lisbon', 'Denver'], format: 'IN_PERSON' }))).toEqual(['lisbon', 'denver']);
    expect(uids(await list(tables, { city: 'lisbon' }))).toEqual(['lisbon', 'lisbon-hybrid']);
    expect(uids(await list(tables, { format: ['VIRTUAL', 'HYBRID'] }))).toEqual(['virtual', 'lisbon-hybrid']);
    // "Lis" is not a city: the match is on the whole city name.
    expect(uids(await list(tables, { city: 'Lis' }))).toEqual([]);
  });

  it('filters by access, tag, host and featured', async () => {
    const tables = {
      pLEvent: [
        event('open', { tags: ['AI', 'DeSci'], hostName: 'Protocol Labs', isFeatured: true }),
        event('paid', { accessOption: 'PAID', tags: ['Crypto'], hostName: 'Filecoin Foundation' }),
        event('invite', { accessOption: 'INVITE', type: 'INVITE_ONLY', hostName: 'protocol labs', isFeatured: null }),
      ],
    };
    expect(uids(await list(tables, { accessOption: ['PAID', 'INVITE'] }))).toEqual(['paid', 'invite']);
    expect(uids(await list(tables, { tag: ['Crypto', 'DeSci'] }))).toEqual(['open', 'paid']);
    expect(uids(await list(tables, { host: 'Protocol Labs' }))).toEqual(['open', 'invite']);
    expect(uids(await list(tables, { featured: 'true' }))).toEqual(['open']);
    expect(uids(await list(tables, { featured: 'false' }))).toEqual(['paid', 'invite']);
    expect(uids(await list(tables, { tag: 'AI', accessOption: 'PAID' }))).toEqual([]);
  });

  it('searches the event name and the host name, ignoring case', async () => {
    const tables = {
      pLEvent: [
        event('a', { name: 'Builders Night' }),
        event('b', { name: 'Demo Day', hostName: 'The BUILDERS club' }),
        event('c', { name: 'Research Summit' }),
      ],
    };
    expect(uids(await list(tables, { search: 'builders' }))).toEqual(['a', 'b']);
  });

  it('answers 200 with no items for a filter with no match', async () => {
    const result = await list({ pLEvent: [event('a', { tags: ['AI'] })] }, { tag: 'Nobody has this' });
    expect(result).toMatchObject({ total: 0, items: [] });
  });

  it('selects the events that overlap a date range, ended events included', async () => {
    const tables = {
      pLEvent: [
        event('last-month', { startDate: inDays(-40), endDate: inDays(-38) }),
        event('spans-in', { startDate: inDays(-60), endDate: inDays(-44) }),
        event('before', { startDate: inDays(-80), endDate: inDays(-70) }),
        event('future', { startDate: inDays(5), endDate: inDays(6) }),
      ],
    };
    const from = inDays(-45).toISOString();
    const to = inDays(-30).toISOString();
    expect(uids(await list(tables, { from, to }))).toEqual(['spans-in', 'last-month']);
    expect(uids(await list(tables, { from }))).toEqual(['spans-in', 'last-month', 'future']);
    expect(uids(await list(tables, { to }))).toEqual(['before', 'spans-in', 'last-month']);
  });

  it('returns only the events the member goes to with going=true, and marks isGoing', async () => {
    const tables = {
      member: [member('m1'), member('m2')],
      pLEvent: [event('a'), event('b')],
      pLEventGuest: [guest('m1', 'a'), guest('m2', 'b')],
    };
    expect(uids(await list(tables, { going: 'true' }, { uid: 'm1' }))).toEqual(['a']);

    const all = await list(tables, {}, { uid: 'm1' });
    expect(all.items.map((item) => [item.uid, item.isGoing])).toEqual([
      ['a', true],
      ['b', false],
    ]);
    const signedOut = await list(tables);
    expect(signedOut.items.every((item) => item.isGoing === false)).toBe(true);
  });

  it('gives each card its fields, the going count and up to 3 faces, newest first', async () => {
    const result = await list({
      member: [
        member('m1'),
        member('m2'),
        member('m3'),
        member('m4'),
        member('gone', { memberApproval: { state: 'REJECTED' } }),
      ],
      image: [
        { uid: 'img-logo', url: 'https://img/logo.png' },
        { uid: 'img-banner', url: 'https://img/banner.png' },
      ],
      pLEvent: [
        event('full', {
          locationUid: 'loc-lisbon',
          logoUid: 'img-logo',
          bannerUid: 'img-banner',
          isAllDay: true,
          tags: ['AI'],
          hostName: 'Protocol Labs',
          venueAddress: 'Avenida da Liberdade 10',
          latitude: 38.72,
          longitude: -9.14,
          isFeatured: true,
          externalId: 'ext-1',
          websiteURL: 'https://example.org',
          additionalInfo: {
            details: {
              host: { name: 'Protocol Labs', logo: 'https://img/pl.png' },
              coHosts: [{ name: 'Filecoin Foundation', logo: null }],
            },
          },
        }),
        event('virtual', { format: 'VIRTUAL', type: 'VIRTUAL', timezone: 'Asia/Tokyo' }),
      ],
      pLEventGuest: [
        guest('m1', 'full'),
        guest('m2', 'full'),
        guest('m3', 'full'),
        guest('m4', 'full'),
        guest('m4', 'full'),
        guest('gone', 'full'),
      ],
    });
    const [full, virtual] = result.items;

    expect(full).toMatchObject({
      uid: 'full',
      allDay: true,
      timezone: 'Europe/Lisbon',
      format: 'IN_PERSON',
      accessOption: 'OPEN',
      tags: ['AI'],
      isFeatured: true,
      logo: 'https://img/logo.png',
      banner: 'https://img/banner.png',
      host: { name: 'Protocol Labs', logo: 'https://img/pl.png' },
      coHosts: [{ name: 'Filecoin Foundation' }],
      gathering: { uid: 'loc-lisbon', city: 'Lisbon', country: 'Portugal' },
      venue: { address: 'Avenida da Liberdade 10', latitude: 38.72, longitude: -9.14 },
      goingCount: 4,
      isGoing: false,
      externalId: 'ext-1',
      websiteUrl: 'https://example.org',
      location: 'Lisbon, Portugal',
      locationUid: 'loc-lisbon',
      flag: '🇵🇹',
    });
    expect(full.faces.map((face) => face.uid)).toEqual(['m4', 'm3', 'm2']);
    expect(full.faces[0]).toEqual({ uid: 'm4', name: 'Name m4', image: 'https://img/m4.png' });

    expect(virtual).toMatchObject({
      format: 'VIRTUAL',
      timezone: 'Asia/Tokyo',
      gathering: null,
      venue: null,
      host: null,
      goingCount: 0,
      faces: [],
      allDay: false,
    });
  });

  it('takes the country from the gathering name when the gathering has no country', async () => {
    const result = await list({ pLEvent: [event('denver', { locationUid: 'loc-denver' })] });
    expect(result.items[0].gathering).toEqual({ uid: 'loc-denver', city: 'Denver', country: 'United States' });
  });

  it('gives an invite-only event no going count and no faces', async () => {
    const result = await list(
      {
        member: [member('m1')],
        pLEvent: [event('secret', { type: 'INVITE_ONLY', accessOption: 'INVITE' })],
        pLEventGuest: [guest('m1', 'secret')],
      },
      {},
      { uid: 'm1' }
    );
    expect(result.items[0]).toMatchObject({ goingCount: null, faces: [], isGoing: true });
  });

  it('reads the going counts and faces of a page in one guest query', async () => {
    const prisma = new InMemoryPrisma({
      member: [member('m1')],
      pLEvent: Array.from({ length: 30 }, (_, i) => event(`e${i}`)),
      pLEventGuest: [guest('m1', 'e0'), guest('m1', 'e7')],
    }).client();
    const guestFindMany = jest.spyOn(prisma.pLEventGuest, 'findMany');
    const service = new PLEventsService(
      prisma as any,
      ...(Array(8).fill({}) as [any, any, any, any, any, any, any, any])
    );

    const result = await service.listPLEvents(parseEventListQuery({}), null);

    expect(result.items).toHaveLength(30);
    expect(guestFindMany).toHaveBeenCalledTimes(1);
  });
});

describe('list helpers', () => {
  it('always starts from the shared visibility filter', () => {
    expect(eventListWhere({ page: 1, limit: 50 }, new Date(), null)).toMatchObject({
      status: 'APPROVED',
      isDeleted: false,
    });
  });

  it('counts distinct rows per event and keeps three faces', () => {
    const row = (eventUid: string, uid: string) => ({
      eventUid,
      memberUid: uid,
      member: { uid, name: uid, image: null },
    });
    const byEvent = attendanceByEvent([row('a', '1'), row('a', '2'), row('a', '3'), row('a', '4'), row('b', '1')]);
    expect(byEvent.get('a')).toMatchObject({ goingCount: 4 });
    expect(byEvent.get('a')?.faces.map((face) => face.uid)).toEqual(['1', '2', '3']);
    expect(byEvent.get('b')?.goingCount).toBe(1);
  });
});

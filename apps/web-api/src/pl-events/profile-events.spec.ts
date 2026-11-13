// The real TeamsService, PrismaService and LogService pull in most of the app, which overflows ts-jest's type check;
// they are stubbed. Prisma is replaced by InMemoryPrisma, which evaluates the service's real query arguments.
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../guards/user-token-check.guard', () => ({ OptionalUserTokenCheckGuard: class {} }));

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { InMemoryPrisma, InMemoryTables } from './fixtures/in-memory-prisma';
import {
  applySummaries,
  groupTeamUpcoming,
  mergeRoles,
  mergeTeamPast,
  pageOf,
  rolesOfAssociation,
  toDemoDayItems,
  toMemberEventCards,
} from './profile-events';
import { ProfileEventsService } from './profile-events.service';
import { parseProfileEventsQuery } from './profile-events.controller';
import { presentEventGuestsForViewer } from '../members/member-event-guests';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const at = (days: number) => new Date(NOW + days * DAY);

function event(uid: string, days: number, extra: Record<string, unknown> = {}) {
  return {
    uid,
    name: `Event ${uid}`,
    type: 'INVITE_ONLY',
    startDate: at(days),
    endDate: at(days + 1),
    isDeleted: false,
    locationUid: 'loc-berlin',
    logo: null,
    location: { location: 'Berlin, Germany' },
    ...extra,
  };
}

function member(uid: string, extra: Record<string, unknown> = {}) {
  return { uid, name: `Member ${uid}`, image: { url: `https://img/${uid}.png` }, memberApproval: null, ...extra };
}

let guestSeq = 0;
function guest(memberUid: string, eventUid: string | null, extra: Record<string, unknown> = {}) {
  guestSeq += 1;
  return {
    uid: `g${guestSeq}`,
    memberUid,
    eventUid,
    teamUid: null,
    isHost: false,
    isSpeaker: false,
    isSponsor: false,
    showOnProfile: true,
    createdAt: new Date(NOW - 1000 * (100 - guestSeq)),
    ...extra,
  };
}

const query = (extra: Record<string, unknown> = {}) => parseProfileEventsQuery(extra);

function serviceOver(tables: InMemoryTables, teams: { assertTeamVisibleToViewer?: jest.Mock } = {}) {
  const teamsService = { assertTeamVisibleToViewer: teams.assertTeamVisibleToViewer ?? jest.fn(async () => ({})) };
  const logger = { info: jest.fn() };
  const prisma = new InMemoryPrisma(tables).client();
  const service = new ProfileEventsService(prisma as any, teamsService as any, logger as any);
  return { service, teamsService, logger };
}

describe('profile-events helpers', () => {
  it('maps association roles; ATTENDEE gives no role', () => {
    expect(rolesOfAssociation('HOST')).toEqual(['Host']);
    expect(rolesOfAssociation('CO_HOST')).toEqual(['Host']);
    expect(rolesOfAssociation('SPEAKER')).toEqual(['Speaker']);
    expect(rolesOfAssociation('SPONSOR')).toEqual(['Sponsor']);
    expect(rolesOfAssociation('ATTENDEE')).toEqual([]);
  });

  it('merges roles in a fixed order without duplicates', () => {
    expect(mergeRoles(['Sponsor', 'Host'], ['Host', 'Speaker'])).toEqual(['Host', 'Speaker', 'Sponsor']);
  });

  it('pages and counts every item', () => {
    expect(pageOf([1, 2, 3, 4, 5], 2, 2)).toEqual({ page: 2, limit: 2, total: 5, items: [3, 4] });
  });

  it('merges duplicate rows of one event; hidden only if every row is hidden', () => {
    const e = event('a', -10);
    const cards = toMemberEventCards([
      { ...guest('m', 'a', { isHost: true, showOnProfile: false }), eventUid: 'a', event: e },
      { ...guest('m', 'a', { isSponsor: true }), eventUid: 'a', event: e },
    ] as any);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ uid: 'a', roles: ['Host', 'Sponsor'], showOnProfile: true });
  });

  it('groups team upcoming rows soonest first, with distinct members and the newest three faces', () => {
    const a = event('a', 20);
    const b = event('b', 5);
    const row = (memberUid: string, e: any, ms: number) => ({
      eventUid: e.uid,
      createdAt: new Date(ms),
      member: member(memberUid),
      event: e,
    });
    const items = groupTeamUpcoming(
      [row('m1', a, 1), row('m2', a, 2), row('m1', a, 9), row('m3', a, 3), row('m4', a, 4), row('m1', b, 1)],
      new Map([['a', ['Sponsor']]])
    );
    expect(items.map((item) => item.uid)).toEqual(['b', 'a']);
    expect(items[1]).toMatchObject({ memberCount: 4, roles: ['Sponsor'] });
    expect(items[1].members.map((person) => person.uid)).toEqual(['m1', 'm4', 'm3']);
  });

  it('merges team past sources per event, newest first', () => {
    const old = event('old', -300);
    const recent = event('recent', -30);
    const items = mergeTeamPast([
      { event: old, roles: ['Host'] },
      { event: recent, roles: ['Speaker'] },
      { event: old, roles: ['Sponsor'] },
    ]);
    expect(items.map((item) => [item.uid, item.roles])).toEqual([
      ['recent', ['Speaker']],
      ['old', ['Host', 'Sponsor']],
    ]);
  });

  it('turns Demo Days into items newest first and leaves them alone when filling summaries', () => {
    const items = toDemoDayItems([
      { uid: 'd1', title: 'DD Spring', slugURL: 'spring', startDate: at(-200), endDate: at(-199) },
      { uid: 'd2', title: 'DD Fall', slugURL: 'fall', startDate: at(-20), endDate: at(-19) },
    ]);
    expect(items.map((item) => item.slug)).toEqual(['fall', 'spring']);
    expect(applySummaries(items, new Map())).toEqual(items);
  });
});

describe('parseProfileEventsQuery', () => {
  it('defaults to page 1 and limit 4', () => {
    expect(parseProfileEventsQuery({})).toEqual({ group: undefined, page: 1, limit: 4 });
    expect(parseProfileEventsQuery(undefined)).toEqual({ group: undefined, page: 1, limit: 4 });
  });

  it('reads numbers from query strings', () => {
    expect(parseProfileEventsQuery({ group: 'past', page: '2', limit: '50' })).toEqual({
      group: 'past',
      page: 2,
      limit: 50,
    });
  });

  it.each([{ limit: '51' }, { limit: '0' }, { page: '0' }, { page: 'x' }, { group: 'all' }])(
    'rejects %p with 400',
    (raw) => {
      expect(() => parseProfileEventsQuery(raw)).toThrow('Bad Request');
    }
  );
});

describe('ProfileEventsService.getMemberEvents', () => {
  const tables = (): InMemoryTables => ({
    member: [member('m'), member('other')],
    pLEvent: [
      event('next-month', 30),
      event('hidden-upcoming', 10),
      event('last-year', -365),
      event('hosted', -40, { location: { location: 'Berlin, Germany' } }),
      event('deleted', -20, { isDeleted: true }),
    ],
    pLEventGuest: [
      guest('m', 'next-month'),
      guest('m', 'hidden-upcoming', { showOnProfile: false }),
      guest('m', 'last-year'),
      guest('m', 'hosted', { isHost: true }),
      guest('m', 'deleted'),
      // Gathering-level attendance: no event.
      guest('m', null),
      guest('other', 'next-month'),
    ],
  });

  it('returns 404 for an unknown member', async () => {
    const { service } = serviceOver(tables());
    await expect(service.getMemberEvents('nobody', null, query())).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists upcoming and past events for a signed-in viewer, without gathering-level or deleted rows', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getMemberEvents('m', { uid: 'other' }, query());
    expect(result.upcoming!.items.map((item) => item.uid)).toEqual(['next-month']);
    expect(result.past!.items.map((item) => item.uid)).toEqual(['hosted', 'last-year']);
    expect(result.past!.total).toBe(2);
  });

  it('gives a signed-out visitor no upcoming events, but past ones', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getMemberEvents('m', null, query());
    expect(result.upcoming).toEqual({ page: 1, limit: 4, total: 0, items: [] });
    expect(result.past!.total).toBe(2);
  });

  it('hides a hidden event from another member, items and total', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getMemberEvents('m', { uid: 'other' }, query({ group: 'upcoming' }));
    expect(result.upcoming!.items.map((item) => item.uid)).not.toContain('hidden-upcoming');
    expect(result.upcoming!.total).toBe(1);
  });

  it('shows the owner their hidden event, marked hidden, soonest first', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getMemberEvents('m', { uid: 'm' }, query({ group: 'upcoming' }));
    expect(result.upcoming!.items.map((item) => [item.uid, item.showOnProfile])).toEqual([
      ['hidden-upcoming', false],
      ['next-month', true],
    ]);
  });

  it("describes a host's card: roles, city, and attendance like the drawer", async () => {
    const t = tables();
    t.member!.push(member('rejected', { memberApproval: { state: 'REJECTED' } }));
    t.pLEventGuest!.push(guest('other', 'hosted'), guest('rejected', 'hosted'));
    const { service } = serviceOver(t);
    const result = await service.getMemberEvents('m', { uid: 'other' }, query({ group: 'past' }));
    const card = result.past!.items.find((item) => item.uid === 'hosted')!;
    expect(card).toMatchObject({
      kind: 'event',
      roles: ['Host'],
      location: 'Berlin, Germany',
      city: 'Berlin',
      locationUid: 'loc-berlin',
      // m and other; the REJECTED member is left out, as on the attendee list.
      goingCount: 2,
      viewerGoing: true,
    });
    expect(card.faces.map((face) => face.uid).sort()).toEqual(['m', 'other']);
    expect(result.past!.items.find((item) => item.uid === 'last-year')).toMatchObject({
      roles: [],
      viewerGoing: false,
    });
  });

  it('hides attendance of INVITE_ONLY events from signed-out visitors', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getMemberEvents('m', null, query({ group: 'past' }));
    expect(result.past!.items[0]).toMatchObject({ goingCount: 0, faces: [], viewerGoing: false });
  });

  describe('with 9 past events', () => {
    const nine = (): InMemoryTables => ({
      member: [member('m')],
      pLEvent: Array.from({ length: 9 }, (_, i) => event(`p${i + 1}`, -10 * (i + 1), { type: 'PUBLIC' })),
      pLEventGuest: Array.from({ length: 9 }, (_, i) => guest('m', `p${i + 1}`)),
    });

    it('pages 4 newest by default and counts all 9', async () => {
      const { service } = serviceOver(nine());
      const result = await service.getMemberEvents('m', null, query());
      expect(result.past!.items.map((item) => item.uid)).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(result.past!.total).toBe(9);
      expect(result.past!.items[0]).toMatchObject({ goingCount: 1 });
    });

    it('returns only the past group with group=past&limit=50', async () => {
      const { service } = serviceOver(nine());
      const result = await service.getMemberEvents('m', null, query({ group: 'past', limit: '50' }));
      expect(result).not.toHaveProperty('upcoming');
      expect(result.past!.items).toHaveLength(9);
    });

    it('serves the next page', async () => {
      const { service } = serviceOver(nine());
      const result = await service.getMemberEvents('m', null, query({ group: 'past', page: '3' }));
      expect(result.past!.items.map((item) => item.uid)).toEqual(['p9']);
    });
  });
});

describe('ProfileEventsService.getTeamEvents', () => {
  const tables = (): InMemoryTables => ({
    member: [
      member('t1'),
      member('t2'),
      member('former'),
      member('viewer'),
      member('rejected', { memberApproval: { state: 'REJECTED' } }),
    ],
    teamMemberRole: [
      { teamUid: 'T', memberUid: 't1', endDate: null },
      { teamUid: 'T', memberUid: 't2', endDate: at(100) },
      { teamUid: 'T', memberUid: 'former', endDate: at(-30) },
      { teamUid: 'T', memberUid: 'rejected', endDate: null },
    ],
    pLEvent: [
      event('a', 30, { type: 'PUBLIC' }),
      event('hidden', 15),
      event('former-only', 40),
      event('hosted', -60, { startDate: at(-60), endDate: at(-59) }),
      event('attended', -90),
    ],
    pLEventGuest: [
      guest('t1', 'a'),
      guest('t2', 'a'),
      guest('viewer', 'a'),
      guest('rejected', 'a'),
      guest('t1', 'hidden', { showOnProfile: false }),
      guest('former', 'former-only'),
      // A past event a member went to, with no team role: not a team event.
      guest('t1', 'attended', { teamUid: 'T' }),
    ],
    pLEventAssociation: [
      { eventUid: 'a', entityType: 'TEAM', teamUid: 'T', role: 'SPONSOR' },
      { eventUid: 'hosted', entityType: 'TEAM', teamUid: 'T', role: 'HOST' },
      { eventUid: 'attended', entityType: 'TEAM', teamUid: 'T', role: 'ATTENDEE' },
    ],
    demoDay: [
      {
        uid: 'dd-oct',
        title: 'Demo Day October',
        slugURL: 'oct-2026',
        startDate: at(-40),
        endDate: at(-39),
        isDeleted: false,
      },
      { uid: 'dd-off', title: 'Disabled', slugURL: 'off', startDate: at(-50), endDate: at(-49), isDeleted: false },
      { uid: 'dd-next', title: 'Not yet', slugURL: 'next', startDate: at(5), endDate: at(6), isDeleted: false },
      { uid: 'dd-gone', title: 'Deleted', slugURL: 'gone', startDate: at(-70), endDate: at(-69), isDeleted: true },
      {
        uid: 'dd-other',
        title: 'Other team',
        slugURL: 'other',
        startDate: at(-80),
        endDate: at(-79),
        isDeleted: false,
      },
      {
        uid: 'dd-investor',
        title: 'Investor only',
        slugURL: 'inv',
        startDate: at(-85),
        endDate: at(-84),
        isDeleted: false,
      },
    ],
    demoDayParticipant: [
      { demoDayUid: 'dd-oct', type: 'FOUNDER', status: 'ENABLED', teamUid: 'T', isDeleted: false },
      { demoDayUid: 'dd-off', type: 'FOUNDER', status: 'DISABLED', teamUid: 'T', isDeleted: false },
      { demoDayUid: 'dd-next', type: 'FOUNDER', status: 'ENABLED', teamUid: 'T', isDeleted: false },
      { demoDayUid: 'dd-gone', type: 'FOUNDER', status: 'ENABLED', teamUid: 'T', isDeleted: false },
      { demoDayUid: 'dd-other', type: 'FOUNDER', status: 'ENABLED', teamUid: 'OTHER', isDeleted: false },
      { demoDayUid: 'dd-investor', type: 'INVESTOR', status: 'ENABLED', teamUid: 'T', isDeleted: false },
    ],
  });

  it("checks the team's visibility first, with the viewer's email", async () => {
    const assert = jest.fn(async () => ({}));
    const { service } = serviceOver(tables(), { assertTeamVisibleToViewer: assert });
    await service.getTeamEvents('T', { uid: 'viewer' }, 'v@x.io', query());
    expect(assert).toHaveBeenCalledWith('T', 'v@x.io');
  });

  it('passes on 403 for an L0 team and 404 for an unknown one', async () => {
    const forbidden = serviceOver(tables(), {
      assertTeamVisibleToViewer: jest.fn(async () => {
        throw new ForbiddenException('Team is inactive');
      }),
    });
    await expect(forbidden.service.getTeamEvents('T', null, undefined, query())).rejects.toThrow('Team is inactive');
    const missing = serviceOver(tables(), {
      assertTeamVisibleToViewer: jest.fn(async () => {
        throw new NotFoundException('Team not found');
      }),
    });
    await expect(missing.service.getTeamEvents('nope', null, undefined, query())).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('groups teammates going to one event, with team roles; leaves out hidden, former and REJECTED members', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getTeamEvents('T', { uid: 'viewer' }, 'v@x.io', query({ group: 'upcoming' }));
    expect(result.upcoming!.items.map((item) => item.uid)).toEqual(['a']);
    expect(result.upcoming!.total).toBe(1);
    const a = result.upcoming!.items[0];
    expect(a).toMatchObject({ roles: ['Sponsor'], memberCount: 2, viewerGoing: true });
    expect(a.members.map((person) => person.uid).sort()).toEqual(['t1', 't2']);
    // Everyone going except the REJECTED member: t1, t2 and the viewer.
    expect(a.goingCount).toBe(3);
  });

  it('gives a signed-out visitor no upcoming events', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getTeamEvents('T', null, undefined, query());
    expect(result.upcoming).toEqual({ page: 1, limit: 4, total: 0, items: [] });
  });

  it('lists past Demo Days first, then events the team hosted; ATTENDEE gives no event', async () => {
    const { service } = serviceOver(tables());
    const result = await service.getTeamEvents('T', null, undefined, query({ group: 'past' }));
    expect(result.past!.items.map((item) => [item.kind, item.uid])).toEqual([
      ['demo-day', 'dd-oct'],
      ['event', 'hosted'],
    ]);
    expect(result.past!.items[0]).toEqual({
      kind: 'demo-day',
      uid: 'dd-oct',
      title: 'Demo Day October',
      slug: 'oct-2026',
      startDate: at(-40).toISOString(),
      endDate: at(-39).toISOString(),
    });
    expect(result.past!.items[1]).toMatchObject({ roles: ['Host'] });
    expect(result.past!.total).toBe(2);
  });

  it('takes past roles from guest rows that name the team, merged with associations', async () => {
    const t = tables();
    t.pLEventGuest!.push(guest('t2', 'hosted', { teamUid: 'T', isSpeaker: true }));
    const { service } = serviceOver(t);
    const result = await service.getTeamEvents('T', null, undefined, query({ group: 'past' }));
    expect(result.past!.items.find((item) => item.uid === 'hosted')).toMatchObject({ roles: ['Host', 'Speaker'] });
  });
});

describe('presentEventGuestsForViewer (GET /v1/members/:uid)', () => {
  const memberWithRows = {
    uid: 'm',
    eventGuests: [
      { uid: 'g1', showOnProfile: true },
      { uid: 'g2', showOnProfile: false },
    ],
  };

  it('drops hidden rows for another viewer', () => {
    expect(presentEventGuestsForViewer(memberWithRows, false).eventGuests.map((row) => row.uid)).toEqual(['g1']);
  });

  it('keeps hidden rows for the owner', () => {
    expect(presentEventGuestsForViewer(memberWithRows, true).eventGuests).toHaveLength(2);
  });

  it('leaves a member without event rows alone', () => {
    expect(presentEventGuestsForViewer({ uid: 'm' }, false)).toEqual({ uid: 'm' });
  });
});

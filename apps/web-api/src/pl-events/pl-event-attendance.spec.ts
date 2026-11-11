// Loading the real collaborators makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed here,
// as in team-hiring.service.spec.ts. The guests service and the controller under test are real.
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class {} }));
jest.mock('./pl-events.service', () => ({ PLEventsService: class {} }));
jest.mock('./pl-event-sync.service', () => ({ PLEventSyncService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('../utils/aws/aws.service', () => ({ AwsService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PLEventGuestsService } from './pl-event-guests.service';
import { PLEventsController } from './pl-events.controller';

/**
 * LAB-3213: per-event attendance. An in-memory `PLEventGuest` table stands in for Prisma, so these tests check the
 * rows that end up stored, not just the calls made.
 */

type Row = {
  uid: string;
  memberUid: string;
  locationUid: string;
  eventUid: string | null;
  teamUid: string | null;
  topics: string[];
  reason: string | null;
  telegramId: string | null;
  officeHours: string | null;
  additionalInfo: Record<string, unknown> | null;
  isHost: boolean;
  isSpeaker: boolean;
  isSponsor: boolean;
  showOnProfile: boolean;
  createdAt: Date;
};

const LOC = 'loc-1';
const ME = { uid: 'm-me', email: 'me@x.io' } as any;
const OTHER = 'm-other';

function matches(row: Row, where: any = {}): boolean {
  return Object.entries(where).every(([key, cond]: [string, any]) => {
    if (key === 'OR') return (cond as any[]).some((c) => matches(row, c));
    const value = (row as any)[key];
    if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
      if ('in' in cond) return cond.in.includes(value);
      if ('not' in cond) return value !== cond.not;
    }
    return value === cond;
  });
}

function pick(row: Row, select?: Record<string, boolean>) {
  if (!select) return { ...row };
  return Object.fromEntries(Object.keys(select).map((k) => [k, (row as any)[k]]));
}

function makeStore(initial: Partial<Row>[] = []) {
  let seq = 0;
  const rows: Row[] = [];
  const add = (r: Partial<Row>) =>
    rows.push({
      uid: `g-${++seq}`,
      memberUid: ME.uid,
      locationUid: LOC,
      eventUid: null,
      teamUid: null,
      topics: [],
      reason: null,
      telegramId: null,
      officeHours: null,
      additionalInfo: null,
      isHost: false,
      isSpeaker: false,
      isSponsor: false,
      showOnProfile: true,
      createdAt: new Date(2026, 0, seq),
      ...r,
    } as Row);
  initial.forEach(add);

  const pLEventGuest = {
    findFirst: jest.fn(async ({ where, select }: any) => {
      const row = rows.find((r) => matches(r, where));
      return row ? pick(row, select) : null;
    }),
    findMany: jest.fn(async ({ where, select }: any = {}) =>
      rows.filter((r) => matches(r, where)).map((r) => pick(r, select))
    ),
    createMany: jest.fn(async ({ data }: any) => {
      data.forEach(add);
      return { count: data.length };
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      const hit = rows.filter((r) => matches(r, where));
      hit.forEach((r) =>
        Object.entries(data).forEach(([k, v]) => {
          if (v !== undefined) (r as any)[k] = v;
        })
      );
      return { count: hit.length };
    }),
    update: jest.fn(async ({ where, data, select }: any) => {
      const row = rows.find((r) => r.uid === where.uid);
      if (!row) throw new Error('not found');
      Object.entries(data).forEach(([k, v]) => {
        if (v !== undefined) (row as any)[k] = v;
      });
      return pick(row, select);
    }),
    deleteMany: jest.fn(async ({ where }: any) => {
      const before = rows.length;
      for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], where)) rows.splice(i, 1);
      return { count: before - rows.length };
    }),
  };

  const prisma: any = {
    pLEventGuest,
    pLEvent: { findMany: jest.fn(async () => []) },
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  return { rows, prisma };
}

function makeService(prisma: any, overrides: { isAdmin?: boolean; locationEvents?: any[] } = {}) {
  const memberService: any = {
    checkIfAdminUser: jest.fn(() => !!overrides.isAdmin),
    findMemberByUid: jest.fn(async (uid: string) => ({ uid })),
    findOne: jest.fn(async (uid: string) => ({ uid })),
    updateTelegramIfChanged: jest.fn(async () => undefined),
    updateOfficeHoursIfChanged: jest.fn(async () => undefined),
    findMemberByEmail: jest.fn(async () => ME),
    isMemberPartOfTeams: jest.fn(async () => false),
  };
  const events = overrides.locationEvents ?? [];
  const eventLocationsService: any = {
    subscribeLocationByUid: jest.fn(async () => undefined),
    getPLEventLocationByUid: jest.fn(async () => ({ uid: LOC, events, upcomingEvents: events, pastEvents: [] })),
    getUpcomingEventsByLocation: jest.fn(async () => events),
    getPastEventsByLocation: jest.fn(async () => []),
  };
  const push: any = {
    refreshCandidatesForEventsAndUpdateNotifications: jest.fn(async () => undefined),
    refreshNotificationsForLocation: jest.fn(async () => undefined),
  };
  const logger: any = { info: jest.fn(), error: jest.fn() };
  const cache: any = { reset: jest.fn(async () => undefined) };
  const service = new PLEventGuestsService(
    prisma,
    logger,
    memberService,
    eventLocationsService,
    cache,
    {} as any,
    {} as any,
    {} as any,
    push
  );
  return { service, memberService, eventLocationsService, push, cache };
}

function makeController(service: PLEventGuestsService, memberService: any, eventService: any = {}) {
  return new PLEventsController(memberService, eventService, {} as any, service, {} as any, {} as any);
}

const request = { userEmail: ME.email, query: {} };

describe('Guest create (LAB-3213)', () => {
  it('going to a second event adds one row and leaves the first alone; no team is stored as null; showOnProfile is kept', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A', teamUid: 't1' }]);
    const { service } = makeService(prisma, { locationEvents: [{ uid: 'A' }, { uid: 'B' }] });

    await service.createPLEventGuestByLocation(
      { memberUid: ME.uid, teamUid: '', officeHours: '', showOnProfile: false, events: [{ uid: 'B' }] } as any,
      ME,
      LOC,
      ME.email,
      { location: 'Lisbon' }
    );

    expect(rows.map((r) => r.eventUid).sort()).toEqual(['A', 'B']);
    const b = rows.find((r) => r.eventUid === 'B') as Row;
    expect(b.teamUid).toBeNull();
    expect(b.showOnProfile).toBe(false);
    expect(prisma.pLEventGuest.deleteMany).not.toHaveBeenCalled();
  });

  it('defaults showOnProfile to true', async () => {
    const { rows, prisma } = makeStore();
    const { service } = makeService(prisma, { locationEvents: [{ uid: 'A' }] });
    await service.createPLEventGuestByLocation(
      { memberUid: ME.uid, teamUid: 't1', officeHours: '', events: [{ uid: 'A' }] } as any,
      ME,
      LOC,
      ME.email,
      { location: 'Lisbon' }
    );
    expect(rows[0].showOnProfile).toBe(true);
    expect(rows[0].teamUid).toBe('t1');
  });

  it('going twice to the same event is a 409 and adds nothing', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A' }]);
    const { service } = makeService(prisma, { locationEvents: [{ uid: 'A' }] });
    await expect(
      service.createPLEventGuestByLocation(
        { memberUid: ME.uid, teamUid: '', officeHours: '', events: [{ uid: 'A' }] } as any,
        ME,
        LOC,
        ME.email,
        { location: 'Lisbon' }
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(rows).toHaveLength(1);
  });
});

describe('PATCH /v1/irl/events/:uid/me (LAB-3213)', () => {
  it('the owner hides their event', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A' }, { eventUid: 'A', memberUid: OTHER }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);

    await expect(controller.updateMyEventVisibility('A', { showOnProfile: false }, request)).resolves.toEqual({
      eventUid: 'A',
      showOnProfile: false,
    });
    expect((rows.find((r) => r.memberUid === ME.uid) as Row).showOnProfile).toBe(false);
    expect((rows.find((r) => r.memberUid === OTHER) as Row).showOnProfile).toBe(true);
  });

  it('a member who is not going gets 404', async () => {
    const { prisma } = makeStore([{ eventUid: 'A', memberUid: OTHER }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(controller.updateMyEventVisibility('A', { showOnProfile: false }, request)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('an invalid body gets 400 and changes nothing', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A' }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(controller.updateMyEventVisibility('A', { showOnProfile: 'no' }, request)).rejects.toBeInstanceOf(
      BadRequestException
    );
    expect(rows[0].showOnProfile).toBe(true);
  });
});

describe('PATCH /v1/irl/locations/:uid/guests/me (LAB-3213)', () => {
  it('sets roles on A only, shares details with A and B, and keeps a hidden row hidden', async () => {
    const { rows, prisma } = makeStore([
      { eventUid: 'A', showOnProfile: false, additionalInfo: { hostSubEvents: [] } },
      { eventUid: 'B' },
    ]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);

    await controller.updateMyGuestPlansByLocation(
      LOC,
      {
        topics: ['AI'],
        additionalInfo: { checkInDate: '2026-12-01', checkOutDate: '2026-12-03' },
        events: [{ uid: 'A', isSpeaker: true }],
      },
      request
    );

    const a = rows.find((r) => r.eventUid === 'A') as Row;
    const b = rows.find((r) => r.eventUid === 'B') as Row;
    expect(a.isSpeaker).toBe(true);
    expect(b.isSpeaker).toBe(false);
    expect(a.showOnProfile).toBe(false);
    expect(a.topics).toEqual(['AI']);
    expect(b.topics).toEqual(['AI']);
    expect(a.additionalInfo).toEqual({ hostSubEvents: [], checkInDate: '2026-12-01', checkOutDate: '2026-12-03' });
    expect(b.additionalInfo).toEqual({ checkInDate: '2026-12-01', checkOutDate: '2026-12-03' });
    expect(prisma.pLEventGuest.createMany).not.toHaveBeenCalled();
    expect(prisma.pLEventGuest.deleteMany).not.toHaveBeenCalled();
  });

  it('cannot add an event: 400 and no row is created', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A' }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(
      controller.updateMyGuestPlansByLocation(LOC, { events: [{ uid: 'B', isHost: true }] }, request)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(1);
    expect(rows[0].isHost).toBe(false);
  });

  it('404 when the caller has no rows at the gathering', async () => {
    const { prisma } = makeStore([{ eventUid: 'A', memberUid: OTHER }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(controller.updateMyGuestPlansByLocation(LOC, { topics: ['AI'] }, request)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('refuses a team the member is not part of', async () => {
    const { prisma } = makeStore([{ eventUid: 'A' }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(controller.updateMyGuestPlansByLocation(LOC, { teamUid: 'not-mine' }, request)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe('Not going (POST /v1/irl/locations/:uid/events/guests, LAB-3213)', () => {
  const seed = () => makeStore([{ eventUid: 'A' }, { eventUid: 'B' }, { eventUid: null }]);

  it('a contract-shaped body without events is a 400 and deletes nothing', async () => {
    const { rows, prisma } = seed();
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(
      controller.deletePLEventGuestsByLocation(
        LOC,
        { membersAndEvents: [{ memberUid: ME.uid, eventUid: 'A' }] } as any,
        request
      )
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(3);
  });

  it('an empty list of entries is a 400', async () => {
    const { rows, prisma } = seed();
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(
      controller.deletePLEventGuestsByLocation(LOC, { membersAndEvents: [] } as any, request)
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(3);
  });

  it('events: [A] deletes only A', async () => {
    const { rows, prisma } = seed();
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await controller.deletePLEventGuestsByLocation(
      LOC,
      { membersAndEvents: [{ memberUid: ME.uid, events: ['A'] }] },
      request
    );
    expect(rows.map((r) => r.eventUid)).toEqual(['B', null]);
  });

  it('events: [] still deletes every row of that member at the gathering (admin popup)', async () => {
    const { rows, prisma } = makeStore([{ eventUid: 'A' }, { eventUid: null }, { eventUid: 'A', memberUid: OTHER }]);
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await controller.deletePLEventGuestsByLocation(
      LOC,
      { membersAndEvents: [{ memberUid: ME.uid, events: [] }] },
      request
    );
    expect(rows.map((r) => r.memberUid)).toEqual([OTHER]);
  });

  it("a non-admin can't delete another member's rows", async () => {
    const { rows, prisma } = seed();
    const { service, memberService } = makeService(prisma);
    const controller = makeController(service, memberService);
    await expect(
      controller.deletePLEventGuestsByLocation(
        LOC,
        { membersAndEvents: [{ memberUid: OTHER, events: ['A'] }] },
        request
      )
    ).rejects.toMatchObject({ status: 403 });
    expect(rows).toHaveLength(3);
  });
});

describe('Strict attendee list (GET /v1/irl/locations/:uid/guests?eventUid=, LAB-3213)', () => {
  const EVENTS = [
    { uid: 'A', type: 'IN_PERSON', startDate: '2026-12-01', endDate: '2026-12-02' },
    { uid: 'B', type: 'IN_PERSON', startDate: '2026-12-03', endDate: '2026-12-04' },
    { uid: 'X', type: 'INVITE_ONLY', startDate: '2026-12-05', endDate: '2026-12-06' },
  ];

  it('asks only for that event and leaves gathering-level guests out', async () => {
    const { prisma } = makeStore();
    const { service } = makeService(prisma, { locationEvents: EVENTS });
    const fetchAttendees = jest.spyOn(service, 'fetchAttendees').mockResolvedValue([] as any);

    // `eventUids` / `includeLocationOnlyGuests` from the query string must not widen it.
    await service.getPLEventGuestsByLocationAndType(
      LOC,
      { type: 'upcoming', eventUid: 'A', eventUids: ['A', 'B'], includeLocationOnlyGuests: 'true' },
      ME
    );

    expect(fetchAttendees).toHaveBeenCalledTimes(1);
    const args = fetchAttendees.mock.calls[0][0];
    expect(args.eventUids).toEqual(['A']);
    expect(args.includeLocationOnlyGuests).toBe(false);
    // No visibility filter: members who hid the event from their profile are still going.
    expect(JSON.stringify(args)).not.toContain('showOnProfile');
  });

  it('a signed-out viewer of an invite-only event gets an empty list', async () => {
    const { prisma } = makeStore();
    const { service } = makeService(prisma, { locationEvents: EVENTS });
    const fetchAttendees = jest.spyOn(service, 'fetchAttendees').mockResolvedValue([{ memberUid: 'x' }] as any);
    await expect(
      service.getPLEventGuestsByLocationAndType(LOC, { type: 'upcoming', eventUid: 'X' }, null)
    ).resolves.toEqual([]);
    expect(fetchAttendees).not.toHaveBeenCalled();
  });

  it('an event that is not in the gathering gives an empty list, not an error', async () => {
    const { prisma } = makeStore();
    const { service } = makeService(prisma, { locationEvents: EVENTS });
    const fetchAttendees = jest.spyOn(service, 'fetchAttendees').mockResolvedValue([] as any);
    await expect(
      service.getPLEventGuestsByLocationAndType(LOC, { type: 'upcoming', eventUid: 'nope' }, ME)
    ).resolves.toEqual([]);
    expect(fetchAttendees).not.toHaveBeenCalled();
  });

  it('without eventUid the list is unchanged (gathering-level guests included)', async () => {
    const { prisma } = makeStore();
    const { service } = makeService(prisma, { locationEvents: EVENTS });
    const fetchAttendees = jest.spyOn(service, 'fetchAttendees').mockResolvedValue([] as any);
    await service.getPLEventGuestsByLocationAndType(LOC, { type: 'upcoming' }, null);
    const args = fetchAttendees.mock.calls[0][0];
    expect(args.includeLocationOnlyGuests).toBe(true);
    expect(args.eventUids).toEqual(['A', 'B']);
  });
});

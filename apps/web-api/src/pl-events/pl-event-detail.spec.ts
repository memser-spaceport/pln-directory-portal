// Loading the real collaborators makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed here,
// as in team-hiring.service.spec.ts. PLEventsService is real.
jest.mock('./pl-event-guests.service', () => ({ PLEventGuestsService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationService: class {} }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('./pl-event-locations.service', () => ({ PLEventLocationsService: class {} }));
jest.mock('../events/events-tooling.service', () => ({ EventsToolingService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));

import { NotFoundException } from '@nestjs/common';
import { ResponsePLEventDetailSchema } from 'libs/contracts/src/schema/pl-event-attendance';
import { emptyPLEventDetails } from 'libs/contracts/src/schema/pl-event-details';
import { EVENTS_SERVICE_EVENT } from './fixtures/events-service-event.fixture';
import { cityOf, visibleResources } from './pl-event-detail';
import { mapEventDetails, withEventDetails } from './pl-event-details.mapper';
import { PLEventsService } from './pl-events.service';

/** LAB-3213: `GET /v1/irl/events/:uid`. */

const person = (uid: string) => ({ member: { uid, name: `Name ${uid}`, image: { url: `https://img/${uid}.png` } } });

function eventRow(overrides: Record<string, unknown> = {}) {
  return {
    uid: 'ev-1',
    status: 'APPROVED',
    submitterUid: null,
    name: 'Builders Day',
    slugURL: 'builders-day',
    type: 'IN_PERSON',
    startDate: new Date('2026-12-01T09:00:00.000Z'),
    endDate: new Date('2026-12-01T18:00:00.000Z'),
    description: '<p>Day</p>',
    shortDescription: 'Day',
    websiteURL: 'https://example.com',
    externalId: 'ext-1',
    resources: [{ name: 'Public' }, { name: 'Members only', isPrivate: true }],
    logo: { url: 'https://img/logo.png' },
    banner: null,
    location: {
      uid: 'loc-1',
      location: 'Lisbon, Portugal',
      flag: '🇵🇹',
      timezone: 'Europe/Lisbon',
      resources: [{ name: 'Gathering private', isPrivate: true }],
      events: [
        {
          uid: 'ev-1',
          name: 'Builders Day',
          type: 'IN_PERSON',
          startDate: new Date('2026-12-01'),
          endDate: new Date('2026-12-01'),
        },
        {
          uid: 'ev-2',
          name: 'Secret dinner',
          type: 'INVITE_ONLY',
          startDate: new Date('2026-12-02'),
          endDate: new Date('2026-12-02'),
        },
      ],
    },
    ...overrides,
  };
}

function makeService(
  event: any,
  guests: { going?: string[]; hosts?: string[]; rejected?: string[]; viewerRow?: any } = {}
) {
  const going = guests.going ?? ['m-1', 'm-2', 'm-3', 'm-4'];
  // Stands in for the database: a where that excludes REJECTED members drops guests.rejected.
  const listed = (where: any, uids: string[]) =>
    where?.member?.NOT?.memberApproval?.state === 'REJECTED'
      ? uids.filter((uid) => !(guests.rejected ?? []).includes(uid))
      : uids;
  const prisma: any = {
    pLEvent: { findFirst: jest.fn(async () => event) },
    pLEventGuest: {
      findMany: jest.fn(async ({ where, take }: any) =>
        where.isHost ? listed(where, guests.hosts ?? []).map(person) : listed(where, going).slice(0, take).map(person)
      ),
      groupBy: jest.fn(async ({ where }: any) => listed(where, going).map((memberUid) => ({ memberUid }))),
      findFirst: jest.fn(async () => guests.viewerRow ?? null),
    },
  };
  // The real invite-only rule, without its database lookup: signed out drops INVITE_ONLY, signed in keeps everything.
  const eventGuestsService: any = {
    filterEventsByAttendanceAndAdminStatus: jest.fn(async (_uids: unknown, events: any[], viewer: unknown) =>
      viewer ? events : events.filter((e) => e.type !== 'INVITE_ONLY')
    ),
  };
  const service = new PLEventsService(
    prisma,
    { info: jest.fn(), error: jest.fn() } as any,
    eventGuestsService,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
  return { service, prisma, eventGuestsService };
}

const VIEWER = { uid: 'm-viewer' } as any;

describe('PLEventsService.getPLEventDetail (LAB-3213)', () => {
  it('a deleted or unknown event is a 404', async () => {
    const { service, prisma } = makeService(null);
    await expect(service.getPLEventDetail('gone', null)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.pLEvent.findFirst.mock.calls[0][0].where).toEqual({ uid: 'gone', isDeleted: false });
  });

  it('a signed-in viewer who is going: viewerGoing, their roles and visibility, all resources', async () => {
    const { service } = makeService(eventRow(), {
      hosts: ['m-1'],
      viewerRow: { showOnProfile: false, isHost: false, isSpeaker: true, isSponsor: true },
    });
    const detail = await service.getPLEventDetail('ev-1', VIEWER);

    expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail.viewerGoing).toBe(true);
    expect(detail.viewer).toEqual({ showOnProfile: false, roles: ['Speaker', 'Sponsor'] });
    expect(detail.goingCount).toBe(4);
    expect(detail.faces.map((f) => f.uid)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(detail.faces[0]).toEqual({ uid: 'm-1', name: 'Name m-1', image: 'https://img/m-1.png' });
    expect(detail.hosts.map((h) => h.uid)).toEqual(['m-1']);
    expect(detail.resources).toHaveLength(2);
    expect(detail.location?.resources).toHaveLength(1);
    expect(detail.location?.city).toBe('Lisbon');
    expect(detail.location?.events.map((e) => e.uid)).toEqual(['ev-1', 'ev-2']);
    expect(detail.details).toEqual(emptyPLEventDetails());
  });

  it('a signed-in viewer who is not going: viewerGoing false and no viewer block', async () => {
    const { service } = makeService(eventRow());
    const detail = await service.getPLEventDetail('ev-1', VIEWER);
    expect(detail.viewerGoing).toBe(false);
    expect(detail.viewer).toBeNull();
  });

  it('signed out: private resources and invite-only gathering events are left out', async () => {
    const { service, prisma } = makeService(eventRow());
    const detail = await service.getPLEventDetail('ev-1', null);
    expect(detail.resources).toEqual([{ name: 'Public' }]);
    expect(detail.location?.resources).toEqual([]);
    expect(detail.location?.events.map((e) => e.uid)).toEqual(['ev-1']);
    expect(detail.goingCount).toBe(4);
    expect(detail.viewerGoing).toBe(false);
    expect(prisma.pLEventGuest.findFirst).not.toHaveBeenCalled();
  });

  it('signed out on an INVITE_ONLY event: count 0 and no faces', async () => {
    const { service, prisma } = makeService(eventRow({ type: 'INVITE_ONLY' }));
    const detail = await service.getPLEventDetail('ev-1', null);
    expect(detail.goingCount).toBe(0);
    expect(detail.faces).toEqual([]);
    expect(prisma.pLEventGuest.groupBy).not.toHaveBeenCalled();
  });

  it('signed in on an INVITE_ONLY event: the count and faces are shown', async () => {
    const { service } = makeService(eventRow({ type: 'INVITE_ONLY' }));
    const detail = await service.getPLEventDetail('ev-1', VIEWER);
    expect(detail.goingCount).toBe(4);
    expect(detail.faces).toHaveLength(3);
  });

  it('a resynced event returns the details the sync stored (LAB-3214)', async () => {
    const stored = mapEventDetails(EVENTS_SERVICE_EVENT);
    const { service } = makeService(
      eventRow({ additionalInfo: withEventDetails({ irlLink: 'https://x.io' }, stored) })
    );
    const detail = await service.getPLEventDetail('ev-1', null);

    expect(detail.details).toEqual(stored);
    expect(detail.details.tags.length).toBeGreaterThan(0);
    expect(detail.details.agenda).not.toBeNull();
    expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('R3: an event with a link returns details.locationUrl (LAB-3332)', async () => {
    const stored = mapEventDetails(EVENTS_SERVICE_EVENT);
    const { service } = makeService(
      eventRow({ additionalInfo: withEventDetails({ irlLink: 'https://x.io' }, stored) })
    );
    const detail = await service.getPLEventDetail('ev-1', null);

    expect(detail.details.locationUrl).toBe('https://maps.example.org/?q=Fixture+Venue');
    expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
  });

  it('R4: an event with no link returns details.locationUrl null, not a missing key (LAB-3332)', async () => {
    const noLink = mapEventDetails({ ...EVENTS_SERVICE_EVENT, location_url: undefined });
    const olderShape = { tags: [{ name: 'AI', color: null }] };
    for (const additionalInfo of [null, { details: noLink }, { details: olderShape }]) {
      const { service } = makeService(eventRow({ additionalInfo }));
      const detail = await service.getPLEventDetail('ev-1', VIEWER);

      expect(detail.details).toHaveProperty('locationUrl', null);
      expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
    }
  });

  it('an event never resynced returns empty details, never missing fields (LAB-3214)', async () => {
    for (const additionalInfo of [null, { irlLink: 'https://x.io' }]) {
      const { service } = makeService(eventRow({ additionalInfo }));
      const detail = await service.getPLEventDetail('ev-1', VIEWER);
      expect(detail.details).toEqual(emptyPLEventDetails());
    }
  });

  it('an in-person event returns its venue, time zone, links and all-day flag from the columns (LAB-3281)', async () => {
    const { service } = makeService(
      eventRow({
        timezone: 'Europe/Lisbon',
        isAllDay: true,
        venueAddress: 'Avenida da Liberdade 10',
        latitude: 38.7205,
        longitude: -9.1453,
        registrationUrl: 'https://example.org/register',
        meetingUrl: 'https://meet.example.org/room',
      })
    );
    const detail = await service.getPLEventDetail('ev-1', null);

    expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      timezone: 'Europe/Lisbon',
      allDay: true,
      venue: { address: 'Avenida da Liberdade 10', latitude: 38.7205, longitude: -9.1453 },
      registrationUrl: 'https://example.org/register',
      meetingUrl: 'https://meet.example.org/room',
    });
  });

  it('an event with none of the new columns reads null venue and links, and its gathering time zone', async () => {
    const { service } = makeService(eventRow());
    const detail = await service.getPLEventDetail('ev-1', null);

    expect(detail).toMatchObject({
      timezone: 'Europe/Lisbon',
      allDay: false,
      venue: null,
      registrationUrl: null,
      meetingUrl: null,
    });
  });

  it('details come from the columns, with tag colours, host logo and the rest from the stored JSON', async () => {
    const stored = mapEventDetails(EVENTS_SERVICE_EVENT);
    const { service } = makeService(
      eventRow({
        additionalInfo: withEventDetails(null, {
          ...stored,
          tags: [{ name: 'DeSci', color: '#0af' }],
          format: 'IN-PERSON',
          accessOption: null,
        }),
        format: 'HYBRID',
        accessOption: 'PAID',
        tags: ['DeSci', 'Robotics'],
        hostName: 'Protocol Labs R&D',
      })
    );
    const { details } = await service.getPLEventDetail('ev-1', null);

    expect(details.format).toBe('HYBRID');
    expect(details.accessOption).toBe('PAID');
    expect(details.tags).toEqual([
      { name: 'DeSci', color: '#0af' },
      { name: 'Robotics', color: null },
    ]);
    expect(details.host).toEqual({ name: 'Protocol Labs R&D', logo: stored.host?.logo });
    expect(details.agenda).toEqual(stored.agenda);
    expect(details.coHosts).toEqual(stored.coHosts);
    expect(details.locationUrl).toBe(stored.locationUrl);
  });

  it('a pending event is a 404 for another member and for a signed-out viewer (LAB-3325)', async () => {
    const pending = eventRow({ status: 'PENDING', submitterUid: 'm-submitter' });
    await expect(makeService(pending).service.getPLEventDetail('ev-1', VIEWER)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(makeService(pending).service.getPLEventDetail('ev-1', null)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      makeService(eventRow({ status: 'REJECTED', submitterUid: 'm-submitter' })).service.getPLEventDetail(
        'ev-1',
        VIEWER
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('the submitter reads their pending event with its status and the edit form fields', async () => {
    const pending = eventRow({
      status: 'PENDING',
      submitterUid: 'm-submitter',
      reviewNote: null,
      updatedAt: new Date('2026-11-19T10:00:00.000Z'),
      logoUid: 'img-1',
      timezone: 'Europe/Lisbon',
      isAllDay: true,
      format: 'IN_PERSON',
      accessOption: 'OPEN',
      tags: ['AI'],
      hostName: 'Protocol Labs',
      venueAddress: 'Avenida da Liberdade 10',
      latitude: 38.72,
      longitude: -9.14,
      registrationUrl: 'https://lu.ma/abc',
      meetingUrl: null,
      eventAssociations: [{ role: 'HOST', memberUid: 'm-1', teamUid: null }],
      additionalInfo: { details: { locationUrl: 'https://maps.app.goo.gl/abc', locationInstructions: 'Door B' } },
      privateDetails: {
        hostEmail: 'host@pl.xyz',
        coHosts: [{ name: 'Ann', email: 'ann@example.org' }],
        address: { city: 'Lisbon', state: null, country: 'Portugal' },
      },
    });
    const detail = await makeService(pending).service.getPLEventDetail('ev-1', { uid: 'm-submitter' } as any);

    expect(ResponsePLEventDetailSchema.safeParse(detail).success).toBe(true);
    expect(detail).toMatchObject({
      status: 'PENDING',
      timezone: 'Europe/Lisbon',
      allDay: true,
      logoUid: 'img-1',
      format: 'IN_PERSON',
      accessOption: 'OPEN',
      tags: ['AI'],
      hostName: 'Protocol Labs',
      hostEmail: 'host@pl.xyz',
      coHosts: [{ name: 'Ann', email: 'ann@example.org' }],
      registrationUrl: 'https://lu.ma/abc',
      meetingUrl: null,
      updatedAt: '2026-11-19T10:00:00.000Z',
      address: {
        address: 'Avenida da Liberdade 10',
        city: 'Lisbon',
        state: null,
        country: 'Portugal',
        latitude: 38.72,
        longitude: -9.14,
        locationUrl: 'https://maps.app.goo.gl/abc',
        locationInstructions: 'Door B',
      },
      associations: [{ role: 'HOST', memberUid: 'm-1', teamUid: null }],
    });
  });

  it('a directory admin reads a pending event with its status, but not a draft', async () => {
    const admin = { uid: 'm-admin', isDirectoryAdmin: true } as any;
    const pending = eventRow({ status: 'PENDING', submitterUid: 'm-submitter' });
    expect((await makeService(pending).service.getPLEventDetail('ev-1', admin)).status).toBe('PENDING');

    const draft = eventRow({ status: 'DRAFT', submitterUid: 'm-submitter' });
    await expect(makeService(draft).service.getPLEventDetail('ev-1', admin)).rejects.toBeInstanceOf(NotFoundException);
    expect((await makeService(draft).service.getPLEventDetail('ev-1', { uid: 'm-submitter' } as any)).status).toBe(
      'DRAFT'
    );
  });

  it('another member reads an approved event with the host name and no host email or status', async () => {
    const approved = eventRow({
      submitterUid: 'm-submitter',
      hostName: 'Protocol Labs',
      privateDetails: { hostEmail: 'host@pl.xyz', coHosts: [{ name: 'Ann', email: 'ann@example.org' }] },
    });
    const detail = await makeService(approved).service.getPLEventDetail('ev-1', VIEWER);

    expect(detail.details.host).toEqual({ name: 'Protocol Labs', logo: null });
    expect(detail).not.toHaveProperty('status');
    expect(detail).not.toHaveProperty('hostEmail');
    expect(JSON.stringify(detail)).not.toContain('@');
  });

  it('a guest whose member is REJECTED is not counted, not a face and not a host', async () => {
    const { service } = makeService(eventRow(), {
      going: ['m-bad', 'm-1', 'm-2', 'm-3'],
      hosts: ['m-bad', 'm-1'],
      rejected: ['m-bad'],
    });
    const detail = await service.getPLEventDetail('ev-1', VIEWER);
    expect(detail.goingCount).toBe(3);
    expect(detail.faces.map((f) => f.uid)).toEqual(['m-1', 'm-2', 'm-3']);
    expect(detail.hosts.map((h) => h.uid)).toEqual(['m-1']);
  });

  it('an event without a gathering has location null', async () => {
    const { service } = makeService(eventRow({ location: null }));
    const detail = await service.getPLEventDetail('ev-1', VIEWER);
    expect(detail.location).toBeNull();
  });
});

describe('pl-event-detail helpers (LAB-3213)', () => {
  it('cityOf takes the part before the first comma', () => {
    expect(cityOf('Lisbon, Portugal')).toBe('Lisbon');
    expect(cityOf('Denver')).toBe('Denver');
    expect(cityOf(', nowhere')).toBeNull();
    expect(cityOf(null)).toBeNull();
  });

  it('visibleResources drops private ones for signed-out viewers only', () => {
    const list = [{ a: 1 }, { a: 2, isPrivate: true }];
    expect(visibleResources(list, true)).toEqual(list);
    expect(visibleResources(list, false)).toEqual([{ a: 1 }]);
    expect(visibleResources(null, false)).toEqual([]);
  });
});

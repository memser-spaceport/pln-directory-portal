// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: jest.fn() }));
jest.mock('../events/events.service', () => ({ EventsService: jest.fn() }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: jest.fn() }));

import axios from 'axios';
import { creatorEmailOf, PLEventSyncService } from './pl-event-sync.service';
import { mapEventDetails } from './pl-event-details.mapper';
import { mapEventColumns } from './pl-event-columns.mapper';
import { EVENTS_SERVICE_EVENT } from './fixtures/events-service-event.fixture';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** A PLEventSyncService over mocks, plus the mocks to assert on (LAB-3214). */
function setup(existingEvents: Array<Record<string, unknown>>) {
  const prisma = {
    pLEvent: {
      findMany: jest.fn().mockResolvedValue(existingEvents),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ uid: 'new-uid', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    image: { create: jest.fn() },
    member: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const cacheService = { reset: jest.fn() };
  const eventsService = { createEventLocation: jest.fn().mockResolvedValue({ uid: 'loc-1' }) };
  const pushCandidates = { refreshCandidatesForEvents: jest.fn() };
  const service = new PLEventSyncService(
    prisma as any,
    cacheService as any,
    eventsService as any,
    pushCandidates as any
  );
  return { service, prisma, cacheService, eventsService, pushCandidates };
}

function serviceReturns(events: unknown[]) {
  mockedAxios.get.mockResolvedValue({ data: { events } });
}

const details = mapEventDetails(EVENTS_SERVICE_EVENT);
const columns = mapEventColumns(EVENTS_SERVICE_EVENT);

describe('PLEventSyncService keeps event details (LAB-3214)', () => {
  afterEach(() => jest.clearAllMocks());

  it('stores details on an event it creates', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const { service, prisma } = setup([]);

    await service.syncEvents({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });

    expect(prisma.pLEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.pLEvent.create.mock.calls[0][0].data.additionalInfo).toEqual({ details });
    // R1 (LAB-3332): the pull sync stores the events service's location_url.
    expect(prisma.pLEvent.create.mock.calls[0][0].data.additionalInfo.details.locationUrl).toBe(
      EVENTS_SERVICE_EVENT.location_url
    );
  });

  it('replaces details on an event it updates and keeps other additionalInfo keys', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const { service, prisma } = setup([
      {
        uid: 'ev-1',
        name: 'Fixture Summit',
        externalId: EVENTS_SERVICE_EVENT.event_id,
        syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        additionalInfo: { irlLink: 'https://example.org/irl', details: { tags: [{ name: 'old', color: null }] } },
      },
    ]);

    await service.syncEvents({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });

    expect(prisma.pLEvent.update).toHaveBeenCalledTimes(1);
    expect(prisma.pLEvent.update.mock.calls[0][0]).toMatchObject({ where: { uid: 'ev-1' } });
    expect(prisma.pLEvent.update.mock.calls[0][0].data.additionalInfo).toEqual({
      irlLink: 'https://example.org/irl',
      details,
    });
  });

  it('writes the typed columns on an event it creates and on one it updates (LAB-3281)', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const created = setup([]);
    await created.service.syncEvents({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });
    expect(created.prisma.pLEvent.create.mock.calls[0][0].data).toMatchObject({
      timezone: 'Europe/Lisbon',
      format: 'IN_PERSON',
      accessOption: null,
      tags: ['DeSci', 'AI'],
      hostName: 'Protocol Labs',
      venueAddress: 'Fixture Venue, Avenida da Liberdade 10',
      latitude: 38.7205,
      longitude: -9.1453,
      registrationUrl: 'https://example.org/summit/register',
      meetingUrl: 'https://meet.example.org/summit',
    });

    const updated = setup([
      {
        uid: 'ev-1',
        name: 'Fixture Summit',
        externalId: EVENTS_SERVICE_EVENT.event_id,
        syncedAt: new Date('2026-01-01T00:00:00.000Z'),
        additionalInfo: null,
      },
    ]);
    await updated.service.syncEvents({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });
    expect(updated.prisma.pLEvent.update.mock.calls[0][0].data).toMatchObject(columns);
  });

  it('saves an event with a malformed agenda, with the agenda null', async () => {
    serviceReturns([{ ...EVENTS_SERVICE_EVENT, agenda: 'see website' }]);
    const { service, prisma } = setup([]);

    await service.syncEvents({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });

    const stored = prisma.pLEvent.create.mock.calls[0][0].data.additionalInfo.details;
    expect(stored.agenda).toBeNull();
    expect(stored.tags).toEqual(details.tags);
  });
});

describe('PLEventSyncService.syncEventDetailsOnly (LAB-3214 backfill)', () => {
  afterEach(() => jest.clearAllMocks());

  it('writes only the details and the typed columns on events it already has, matched by externalId', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT, { ...EVENTS_SERVICE_EVENT, event_id: 'not-in-directory' }]);
    const { service, prisma, cacheService } = setup([
      { uid: 'ev-1', externalId: EVENTS_SERVICE_EVENT.event_id, additionalInfo: { irlLink: 'x' } },
    ]);

    await expect(service.syncEventDetailsOnly({})).resolves.toEqual({ updated: 1 });

    expect(prisma.pLEvent.findMany.mock.calls[0][0].where).toEqual({
      externalId: { in: [EVENTS_SERVICE_EVENT.event_id, 'not-in-directory'] },
      isDeleted: false,
    });
    expect(prisma.pLEvent.update).toHaveBeenCalledTimes(1);
    expect(prisma.pLEvent.update).toHaveBeenCalledWith({
      where: { uid: 'ev-1' },
      data: { additionalInfo: { irlLink: 'x', details }, ...columns },
    });
    // R1, R5 (LAB-3332): the backfill adds the link and keeps irlLink.
    expect(prisma.pLEvent.update.mock.calls[0][0].data.additionalInfo.details.locationUrl).toBe(
      EVENTS_SERVICE_EVENT.location_url
    );
    expect(prisma.pLEvent.create).not.toHaveBeenCalled();
    expect(prisma.pLEvent.updateMany).not.toHaveBeenCalled();
    expect(prisma.image.create).not.toHaveBeenCalled();
    expect(cacheService.reset).toHaveBeenCalled();
  });

  it('never changes slugURL, name, dates or type', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const { service, prisma } = setup([
      { uid: 'ev-1', externalId: EVENTS_SERVICE_EVENT.event_id, additionalInfo: null },
    ]);

    await service.syncEventDetailsOnly({});

    expect(Object.keys(prisma.pLEvent.update.mock.calls[0][0].data).sort()).toEqual(
      ['additionalInfo', ...Object.keys(columns)].sort()
    );
  });

  it('LAB-3403: asked for one event, writes only that one, whatever the events service answers', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT, { ...EVENTS_SERVICE_EVENT, event_id: 'other' }]);
    const { service, prisma } = setup([
      { uid: 'ev-1', externalId: EVENTS_SERVICE_EVENT.event_id, additionalInfo: null },
      { uid: 'ev-2', externalId: 'other', additionalInfo: null },
    ]);

    await expect(
      service.syncEventDetailsOnly({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] })
    ).resolves.toEqual({ updated: 1 });

    expect(prisma.pLEvent.update.mock.calls.map(([args]) => args.where.uid)).toEqual(['ev-1']);
    expect(mockedAxios.get.mock.calls[0][0]).toContain(`event_id=${EVENTS_SERVICE_EVENT.event_id}`);
  });

  it('LAB-3403: replaces the stored details, so a tag removed in the portal goes', async () => {
    serviceReturns([{ ...EVENTS_SERVICE_EVENT, tags: [] }]);
    const { service, prisma } = setup([
      { uid: 'ev-1', externalId: EVENTS_SERVICE_EVENT.event_id, additionalInfo: { details } },
    ]);

    await service.syncEventDetailsOnly({ selectedEventUids: [EVENTS_SERVICE_EVENT.event_id] });

    expect(prisma.pLEvent.update.mock.calls[0][0].data.additionalInfo.details).toEqual({ ...details, tags: [] });
  });

  it('LAB-3403: a time limit is passed on only when it is given', async () => {
    serviceReturns([]);
    const { service } = setup([]);

    await service.syncEventDetailsOnly({ selectedEventUids: ['a'], timeoutMs: 10_000 });
    await service.syncEventDetailsOnly({});

    expect(mockedAxios.get.mock.calls[0][1]).toMatchObject({ timeout: 10_000 });
    expect(mockedAxios.get.mock.calls[1][1]).not.toHaveProperty('timeout');
  });

  it('returns 0 when the events service sends nothing', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });
    const { service, prisma } = setup([]);

    await expect(service.syncEventDetailsOnly({})).resolves.toEqual({ updated: 0 });
    expect(prisma.pLEvent.update).not.toHaveBeenCalled();
  });
});

describe('the sync does nothing once LabOS owns events (LAB-3327)', () => {
  const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;
  beforeEach(() => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
  });
  afterEach(() => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
    jest.clearAllMocks();
  });

  it('the pull sync fetches nothing and writes nothing', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const { service, prisma } = setup([{ uid: 'ev-1', externalId: 'gone-from-the-service', name: 'Kept' }]);

    await expect(service.syncEvents({})).resolves.toMatchObject({ skipped: true });

    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(prisma.pLEvent.findMany).not.toHaveBeenCalled();
    expect(prisma.pLEvent.create).not.toHaveBeenCalled();
    expect(prisma.pLEvent.update).not.toHaveBeenCalled();
    // In particular it does not delete events the old service no longer lists.
    expect(prisma.pLEvent.updateMany).not.toHaveBeenCalled();
  });

  it('the details backfill writes nothing', async () => {
    serviceReturns([EVENTS_SERVICE_EVENT]);
    const { service, prisma } = setup([
      { uid: 'ev-1', externalId: EVENTS_SERVICE_EVENT.event_id, additionalInfo: null },
    ]);

    await expect(service.syncEventDetailsOnly({})).resolves.toMatchObject({ updated: 0, skipped: true });
    expect(mockedAxios.get).not.toHaveBeenCalled();
    expect(prisma.pLEvent.update).not.toHaveBeenCalled();
  });
});

describe('waiting events and drafts move with the cutover (LAB-3327)', () => {
  afterEach(() => jest.clearAllMocks());

  /** The events service answers by the `status` asked for. */
  function serviceByStatus(byStatus: Record<string, unknown[]>) {
    mockedAxios.get.mockImplementation((url: string) => {
      const status = new URL(url, 'http://x').searchParams.get('status') ?? '';
      return Promise.resolve({ data: { events: byStatus[status] ?? [] } });
    });
  }
  const waiting = { ...EVENTS_SERVICE_EVENT, event_id: 'w-1', status: 'SUBMITTED', created_by: 'Ann@Example.org' };
  const draft = { ...EVENTS_SERVICE_EVENT, event_id: 'd-1', status: 'PENDING', created_by: 'nobody@example.org' };
  const rejected = { ...EVENTS_SERVICE_EVENT, event_id: 'r-1', status: 'REJECTED' };

  it('stores waiting events as PENDING and drafts as DRAFT, with the submitter found by email', async () => {
    serviceByStatus({ SUBMITTED: [waiting], PENDING: [draft], REJECTED: [rejected] });
    const { service, prisma, pushCandidates } = setup([]);
    prisma.member.findMany.mockResolvedValue([{ uid: 'm-ann', email: 'ann@example.org' }]);

    const result = await service.importNonApprovedEvents();

    const created = prisma.pLEvent.create.mock.calls.map(([arg]) => arg.data);
    expect(created.map((d) => [d.externalId, d.status, d.submitterUid])).toEqual([
      ['w-1', 'PENDING', 'm-ann'],
      ['d-1', 'DRAFT', null],
    ]);
    expect(result).toEqual({
      pending: { fetched: 1, created: 1, updated: 0, skippedApproved: 0 },
      draft: { fetched: 1, created: 1, updated: 0, skippedApproved: 0 },
      withoutSubmitter: 1,
    });
    // Rejected events are not asked for, and nothing is announced for events that are not approved.
    expect(mockedAxios.get.mock.calls.map(([url]) => new URL(url, 'http://x').searchParams.get('status'))).toEqual([
      'SUBMITTED',
      'PENDING',
    ]);
    expect(pushCandidates.refreshCandidatesForEvents).not.toHaveBeenCalled();
    expect(prisma.pLEvent.updateMany).not.toHaveBeenCalled();
  });

  it('updates what it brought over before and leaves an event LabOS has as approved', async () => {
    serviceByStatus({ SUBMITTED: [waiting, { ...waiting, event_id: 'w-approved' }] });
    const { service, prisma } = setup([
      { uid: 'ev-w1', externalId: 'w-1', status: 'DRAFT', additionalInfo: null },
      { uid: 'ev-ok', externalId: 'w-approved', status: 'APPROVED', additionalInfo: null },
    ]);

    const result = await service.importNonApprovedEvents();

    expect(prisma.pLEvent.update).toHaveBeenCalledTimes(1);
    expect(prisma.pLEvent.update.mock.calls[0][0]).toMatchObject({ where: { uid: 'ev-w1' }, data: { status: 'PENDING' } });
    expect(prisma.pLEvent.create).not.toHaveBeenCalled();
    expect(result).toMatchObject({ pending: { fetched: 2, updated: 1, skippedApproved: 1 } });
  });

  it('matches only its own events, never a partner app’s', async () => {
    serviceByStatus({ SUBMITTED: [waiting] });
    const { service, prisma } = setup([]);

    await service.importNonApprovedEvents();

    expect(prisma.pLEvent.findMany.mock.calls[0][0].where).toMatchObject({ sourceTeamUid: null, isDeleted: false });
  });

  it('keeps an event with an address it cannot place, with no gathering', async () => {
    serviceByStatus({ PENDING: [draft] });
    const { service, prisma, eventsService } = setup([]);
    eventsService.createEventLocation.mockRejectedValue(new Error('no city'));

    await service.importNonApprovedEvents();

    expect(prisma.pLEvent.create.mock.calls[0][0].data).toMatchObject({ externalId: 'd-1', locationUid: null });
  });

  it('does nothing once LabOS owns events', async () => {
    const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    try {
      const { service, prisma } = setup([]);
      await expect(service.importNonApprovedEvents()).resolves.toMatchObject({ skipped: true });
      expect(mockedAxios.get).not.toHaveBeenCalled();
      expect(prisma.pLEvent.create).not.toHaveBeenCalled();
    } finally {
      process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
    }
  });

  it('the full sync approves an event that waited, and never deletes a waiting event or a draft', async () => {
    serviceByStatus({ APPROVED: [{ ...EVENTS_SERVICE_EVENT, event_id: 'w-1', updatedAt: '2030-01-01T00:00:00.000Z' }] });
    const { service, prisma } = setup([
      { uid: 'ev-w1', name: 'Was waiting', externalId: 'w-1', status: 'PENDING', syncedAt: new Date('2026-01-01') },
      { uid: 'ev-d1', name: 'A draft', externalId: 'd-1', status: 'DRAFT', syncedAt: new Date('2026-01-01') },
      { uid: 'ev-gone', name: 'No longer approved', externalId: 'gone', status: 'APPROVED', syncedAt: new Date() },
    ]);

    await service.syncEvents({});

    expect(prisma.pLEvent.update.mock.calls[0][0]).toMatchObject({ where: { uid: 'ev-w1' }, data: { status: 'APPROVED' } });
    expect(prisma.pLEvent.updateMany).toHaveBeenCalledWith({
      where: { uid: { in: ['ev-gone'] } },
      data: { isDeleted: true },
    });
    expect(prisma.pLEvent.findMany.mock.calls[0][0].where.AND).toMatchObject({ sourceTeamUid: null });
  });

  it('reads the creator email from created_by, else submitted_by', () => {
    expect(creatorEmailOf({ created_by: ' Ann@Example.org ' })).toBe('ann@example.org');
    expect(creatorEmailOf({ created_by: null, submitted_by: 'bo@example.org' })).toBe('bo@example.org');
    expect(creatorEmailOf({ created_by: 'not an email' })).toBeNull();
    expect(creatorEmailOf({})).toBeNull();
  });
});

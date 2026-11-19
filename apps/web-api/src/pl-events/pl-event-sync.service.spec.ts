// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: jest.fn() }));
jest.mock('../events/events.service', () => ({ EventsService: jest.fn() }));
jest.mock('./push/irl-gathering-push-candidates.service', () => ({ IrlGatheringPushCandidatesService: jest.fn() }));

import axios from 'axios';
import { PLEventSyncService } from './pl-event-sync.service';
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
  return { service, prisma, cacheService };
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

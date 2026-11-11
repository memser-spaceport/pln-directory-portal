// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('../shared/log.service', () => ({ LogService: jest.fn() }));
jest.mock('../pl-events/pl-events.service', () => ({ PLEventsService: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../pl-events/pl-event-location-association.service', () => ({
  PLEventLocationAssociationService: jest.fn(),
}));
jest.mock('../pl-events/pl-event-locations.service', () => ({ PLEventLocationsService: jest.fn() }));
jest.mock('../pl-events/pl-event-association.service', () => ({ PLEventAssociationService: jest.fn() }));
jest.mock('./event-guests-sync.helper', () => ({ EventGuestSyncHelper: jest.fn() }));
jest.mock('../members/members.service', () => ({ MembersService: jest.fn() }));
jest.mock('../teams/teams.service', () => ({ TeamsService: jest.fn() }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: jest.fn() }));

import { omit } from 'lodash';
import { EventConsumerHelper } from './event-consumer.helper';
import { mapEventDetails } from '../pl-events/pl-event-details.mapper';
import { EVENTS_SERVICE_EVENT } from '../pl-events/fixtures/events-service-event.fixture';

/** EventConsumerHelper over mocks: only what mapEventData and syncEvent touch (LAB-3214). */
function setup(existingEvent: Record<string, unknown> | null) {
  const logger = { info: jest.fn(), error: jest.fn() };
  const plEventsService = {
    getPLEvents: jest.fn().mockResolvedValue(existingEvent ? [existingEvent] : []),
    updateEventByUid: jest.fn().mockResolvedValue({}),
    createPLEvent: jest.fn().mockResolvedValue({ uid: 'new-uid' }),
  };
  const prisma = { image: { create: jest.fn() } };
  const helper = new EventConsumerHelper(
    logger as any,
    plEventsService as any,
    prisma as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { reset: jest.fn() } as any
  );
  return { helper, plEventsService, logger };
}

const details = mapEventDetails(EVENTS_SERVICE_EVENT);

describe('EventConsumerHelper keeps event details (LAB-3214)', () => {
  it('maps the queue payload with its details', async () => {
    const { helper } = setup(null);

    const mapped = await helper.mapEventData(EVENTS_SERVICE_EVENT);

    expect(mapped.details).toEqual(details);
    expect(mapped.externalId).toBe(EVENTS_SERVICE_EVENT.event_id);
  });

  it('stores details on a new event as additionalInfo, not as a column', async () => {
    const { helper, plEventsService } = setup(null);
    const mapped = omit(await helper.mapEventData(EVENTS_SERVICE_EVENT), 'associations');

    await helper.syncEvent(mapped, 'loc-1', 'assoc-1', 'MANUALLY_MAPPED', {});

    const data = plEventsService.createPLEvent.mock.calls[0][0];
    expect(data.additionalInfo).toEqual({ details });
    expect(data).not.toHaveProperty('details');
  });

  it('replaces details on an existing event and keeps other additionalInfo keys', async () => {
    const { helper, plEventsService } = setup({
      uid: 'ev-1',
      additionalInfo: { irlLink: 'https://example.org/irl', details: { tags: [] } },
    });
    const mapped = omit(await helper.mapEventData(EVENTS_SERVICE_EVENT), 'associations');

    await helper.syncEvent(mapped, 'loc-1', 'assoc-1', 'MANUALLY_MAPPED', {});

    const [uid, data] = plEventsService.updateEventByUid.mock.calls[0];
    expect(uid).toBe('ev-1');
    expect(data.additionalInfo).toEqual({ irlLink: 'https://example.org/irl', details });
    expect(data).not.toHaveProperty('details');
  });

  it('logs a malformed field and still syncs the event', async () => {
    const { helper, plEventsService, logger } = setup(null);
    const mapped = omit(await helper.mapEventData({ ...EVENTS_SERVICE_EVENT, agenda: 7 }), 'associations');

    await helper.syncEvent(mapped, 'loc-1', 'assoc-1', 'MANUALLY_MAPPED', {});

    expect(plEventsService.createPLEvent.mock.calls[0][0].additionalInfo.details.agenda).toBeNull();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('details field "agenda" ignored'),
      'EventConsumerHelper'
    );
  });
});

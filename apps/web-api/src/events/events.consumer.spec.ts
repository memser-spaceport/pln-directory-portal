// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('../shared/log.service', () => ({ LogService: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../pl-events/pl-events.service', () => ({ PLEventsService: jest.fn() }));
jest.mock('../pl-events/pl-event-sync.service', () => ({ PLEventSyncService: jest.fn() }));
jest.mock('./event-consumer.helper', () => ({ EventConsumerHelper: jest.fn() }));
jest.mock('./event-guests-sync.helper', () => ({ EventGuestSyncHelper: jest.fn() }));

import { EventsConsumer } from './events.consumer';

const message = (type: string) => ({
  MessageId: 'm-1',
  Body: JSON.stringify({ body: { type, event: { event_id: 'ext-1', address_info: {} }, location: {} } }),
});

/** EventsConsumer over mocks; `order` records what ran, in order (LAB-3403). */
function setup(locationUid: string | null = 'loc-1') {
  const order: string[] = [];
  const logger = { info: jest.fn(), error: jest.fn() };
  const prisma = {
    $transaction: jest.fn(async (run) => {
      const result = await run({});
      order.push('commit');
      return result;
    }),
  };
  const helper = {
    mapEventData: jest.fn().mockResolvedValue({ externalId: 'ext-1', type: 'IN_PERSON', associations: [] }),
    handleLocationAndAssociation: jest.fn().mockResolvedValue({ locationUid, associationUid: 'assoc-1' }),
    syncEvent: jest.fn().mockResolvedValue('ev-1'),
    syncEventAssociations: jest.fn().mockResolvedValue([]),
    findEventByExternalId: jest.fn().mockResolvedValue(null),
  };
  const sync = {
    syncEventDetailsOnly: jest.fn(async () => {
      order.push('refresh');
      return { updated: 1 };
    }),
  };
  const consumer = new EventsConsumer(
    logger as any,
    prisma as any,
    { deleteEventByUid: jest.fn() } as any,
    helper as any,
    { syncEventGuests: jest.fn() } as any,
    sync as any
  );
  return { consumer, helper, sync, logger, order };
}

describe('EventsConsumer reads the full details after a message (LAB-3403)', () => {
  it('asks for that one event, with a time limit, after the event is saved', async () => {
    const { consumer, sync, order } = setup();

    await consumer.processEventOperation(message('UPSERT'));

    expect(sync.syncEventDetailsOnly).toHaveBeenCalledTimes(1);
    expect(sync.syncEventDetailsOnly).toHaveBeenCalledWith({ selectedEventUids: ['ext-1'], timeoutMs: 10_000 });
    expect(order).toEqual(['commit', 'refresh']);
  });

  it('a failed read is logged and does not send the message back to the queue', async () => {
    const { consumer, sync, logger, helper } = setup();
    sync.syncEventDetailsOnly.mockRejectedValue(new Error('events service is down'));

    await expect(consumer.processEventOperation(message('UPSERT'))).resolves.toBeUndefined();

    expect(helper.syncEvent).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('ext-1: events service is down'),
      expect.anything(),
      'EventsConsumer'
    );
  });

  it('reads nothing when the event was not saved or is deleted', async () => {
    const left = setup(null);
    await left.consumer.processEventOperation(message('UPSERT'));
    expect(left.helper.syncEvent).not.toHaveBeenCalled();
    expect(left.sync.syncEventDetailsOnly).not.toHaveBeenCalled();

    const deleted = setup();
    await deleted.consumer.processEventOperation(message('DELETE'));
    expect(deleted.sync.syncEventDetailsOnly).not.toHaveBeenCalled();
  });

  it('a failed save still throws, so SQS delivers the message again', async () => {
    const { consumer, helper, sync } = setup();
    helper.syncEvent.mockRejectedValue(new Error('db'));

    await expect(consumer.processEventOperation(message('UPSERT'))).rejects.toThrow('db');
    expect(sync.syncEventDetailsOnly).not.toHaveBeenCalled();
  });
});

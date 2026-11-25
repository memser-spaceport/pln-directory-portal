// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('@ssut/nestjs-sqs', () => ({ SqsMessageHandler: () => () => undefined }));
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

function setupFlag() {
  const logger = { info: jest.fn(), error: jest.fn() };
  const prisma = { $transaction: jest.fn() };
  const plEventsService = { deleteEventByUid: jest.fn() };
  const helper = {
    mapEventData: jest.fn(async (event: { event_id: string }) => ({ externalId: event.event_id, type: 'IN_PERSON' })),
    findEventByExternalId: jest.fn(async () => ({ uid: 'ev-1' })),
  };
  const consumer = new EventsConsumer(logger as any, prisma as any, plEventsService as any, helper as any, {} as any, {} as any);
  return { consumer, logger, prisma, plEventsService, helper };
}

const flagMessage = (type: 'UPSERT' | 'DELETE') => ({
  MessageId: 'msg-1',
  Body: JSON.stringify({ body: { type, event: { event_id: 'evt-1', address_info: {} }, location: {} } }),
});

describe('EventsConsumer and EVENTS_LOCAL_SUBMIT_ENABLED (LAB-3327)', () => {
  const flag = process.env.EVENTS_LOCAL_SUBMIT_ENABLED;
  afterEach(() => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = flag;
  });

  it('does nothing with a message once LabOS owns events', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'true';
    const { consumer, prisma, plEventsService, helper, logger } = setupFlag();

    await expect(consumer.processEventOperation(flagMessage('UPSERT'))).resolves.toBeUndefined();
    await expect(consumer.processEventOperation(flagMessage('DELETE'))).resolves.toBeUndefined();

    expect(helper.mapEventData).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(plEventsService.deleteEventByUid).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining('Ignoring events-service message msg-1'),
      'EventsConsumer'
    );
  });

  it('still processes messages while the flag is off', async () => {
    process.env.EVENTS_LOCAL_SUBMIT_ENABLED = 'false';
    const { consumer, prisma, plEventsService, helper } = setupFlag();

    await consumer.processEventOperation(flagMessage('UPSERT'));
    expect(helper.mapEventData).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    await consumer.processEventOperation(flagMessage('DELETE'));
    expect(plEventsService.deleteEventByUid).toHaveBeenCalledWith('ev-1');
  });
});

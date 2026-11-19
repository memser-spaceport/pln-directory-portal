// Stub the service modules: the real ones pull in a module graph that overflows jest's loader.
jest.mock('@ssut/nestjs-sqs', () => ({ SqsMessageHandler: () => () => undefined }));
jest.mock('../shared/log.service', () => ({ LogService: jest.fn() }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: jest.fn() }));
jest.mock('../pl-events/pl-events.service', () => ({ PLEventsService: jest.fn() }));
jest.mock('./event-consumer.helper', () => ({ EventConsumerHelper: jest.fn() }));
jest.mock('./event-guests-sync.helper', () => ({ EventGuestSyncHelper: jest.fn() }));

import { EventsConsumer } from './events.consumer';

function setup() {
  const logger = { info: jest.fn(), error: jest.fn() };
  const prisma = { $transaction: jest.fn() };
  const plEventsService = { deleteEventByUid: jest.fn() };
  const helper = {
    mapEventData: jest.fn(async (event: { event_id: string }) => ({ externalId: event.event_id, type: 'IN_PERSON' })),
    findEventByExternalId: jest.fn(async () => ({ uid: 'ev-1' })),
  };
  const consumer = new EventsConsumer(logger as any, prisma as any, plEventsService as any, helper as any, {} as any);
  return { consumer, logger, prisma, plEventsService, helper };
}

const message = (type: 'UPSERT' | 'DELETE') => ({
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
    const { consumer, prisma, plEventsService, helper, logger } = setup();

    await expect(consumer.processEventOperation(message('UPSERT'))).resolves.toBeUndefined();
    await expect(consumer.processEventOperation(message('DELETE'))).resolves.toBeUndefined();

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
    const { consumer, prisma, plEventsService, helper } = setup();

    await consumer.processEventOperation(message('UPSERT'));
    expect(helper.mapEventData).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    await consumer.processEventOperation(message('DELETE'));
    expect(plEventsService.deleteEventByUid).toHaveBeenCalledWith('ev-1');
  });
});

// Loading the real collaborators makes ts-jest's type check overflow the stack (TS 4.7), so they are stubbed here,
// as in pl-event-detail.spec.ts. PLEventLocationsService is real.
jest.mock('./pl-event-guests.service', () => ({ PLEventGuestsService: class {} }));
jest.mock('../notifications/notifications.service', () => ({ NotificationService: class {} }));
jest.mock('../members/members.service', () => ({ MembersService: class {} }));
jest.mock('../member-subscriptions/member-subscriptions.service', () => ({ MemberSubscriptionService: class {} }));
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class {} }));
jest.mock('../shared/log.service', () => ({ LogService: class {} }));

import { DEFAULT_LOCATION_ORDER, PLEventLocationsService } from './pl-event-locations.service';

/* LAB-3363: a gathering is on IRL Gatherings once it has a visible event, with or without a priority. */

function serviceWith(findMany: jest.Mock) {
  const prisma = { pLEventLocation: { findMany } };
  const logger = { error: jest.fn(), info: jest.fn() };
  return new PLEventLocationsService(
    prisma as any,
    logger as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );
}

describe('PLEventLocationsService.getPLEventLocations (LAB-3363)', () => {
  it('lists a gathering with no priority when it has an approved event, and skips deleted gatherings', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await serviceWith(findMany).getPLEventLocations({});
    const { where } = findMany.mock.calls[0][0];
    expect(where).not.toHaveProperty('priority');
    expect(where.isDeleted).toBe(false);
    // Only approved, not deleted events count: a gathering with only pending, rejected or deleted events stays off.
    expect(where.events).toEqual({ some: { status: 'APPROVED', isDeleted: false } });
  });

  it('orders by priority, then by name, unless the caller asks for an order', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = serviceWith(findMany);
    await service.getPLEventLocations({});
    expect(findMany.mock.calls[0][0].orderBy).toEqual(DEFAULT_LOCATION_ORDER);
    expect(DEFAULT_LOCATION_ORDER).toEqual([{ priority: 'asc' }, { location: 'asc' }]);

    await service.getPLEventLocations({ orderBy: { location: 'desc' } });
    expect(findMany.mock.calls[1][0].orderBy).toEqual({ location: 'desc' });
  });

  it('keeps the caller filter and the same rules when it selects fields', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    await serviceWith(findMany).getPLEventLocations({ where: { country: 'Portugal' }, select: { uid: true } });
    const args = findMany.mock.calls[0][0];
    expect(args.select).toEqual({ uid: true });
    expect(args.where).toEqual({
      country: 'Portugal',
      isDeleted: false,
      events: { some: { status: 'APPROVED', isDeleted: false } },
    });
    expect(args.orderBy).toEqual(DEFAULT_LOCATION_ORDER);
  });
});

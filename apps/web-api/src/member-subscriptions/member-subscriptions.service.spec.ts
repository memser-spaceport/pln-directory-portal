/* The real CacheService pulls in axios, which the ts-jest transform does not
   handle; the same stub the CV-import spec uses. */
jest.mock('../utils/cache/cache.service', () => ({ CacheService: class CacheService {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class PrismaService {} }));

import { NotFoundException } from '@nestjs/common';
import { MemberApprovalState } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';
import { MemberSubscriptionService } from './member-subscriptions.service';

describe('MemberSubscriptionService', () => {
  let service: MemberSubscriptionService;

  const findMany = jest.fn();
  const create = jest.fn();
  const updateMany = jest.fn();
  const findUnique = jest.fn();
  const cacheReset = jest.fn();

  const prismaMock = {
    memberSubscription: { findMany, create, updateMany, findUnique },
  } as unknown as PrismaService;

  const cacheMock = { reset: cacheReset } as unknown as CacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    findMany.mockResolvedValue([]);
    create.mockResolvedValue({ uid: 'sub-new' });
    updateMany.mockResolvedValue({ count: 1 });
    findUnique.mockResolvedValue({ uid: 'sub-1', isActive: false });
    cacheReset.mockResolvedValue(undefined);
    service = new MemberSubscriptionService(prismaMock, cacheMock);
  });

  describe('read audiences', () => {
    it('restricts the public read to approved and verified members', async () => {
      await service.getSubscriptions({ where: { entityUid: 'loc-1' } });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          entityUid: 'loc-1',
          member: {
            memberApproval: {
              state: { in: [MemberApprovalState.APPROVED, MemberApprovalState.VERIFIED] },
            },
          },
        },
      });
    });

    it('does not approval-filter a member reading their own subscriptions', async () => {
      await service.getSubscriptionsForMember('member-1', { where: { entityUid: 'loc-1' } });

      expect(findMany).toHaveBeenCalledWith({
        where: { entityUid: 'loc-1', memberUid: 'member-1' },
      });
      expect(JSON.stringify(findMany.mock.calls[0][0])).not.toContain('memberApproval');
    });

    it('includes pending members in the notification audience but not rejected ones', async () => {
      await service.getNotifiableSubscribers({ where: { entityUid: 'loc-1' } });

      const states = findMany.mock.calls[0][0].where.member.memberApproval.state.in;
      expect(states).toContain(MemberApprovalState.PENDING);
      expect(states).toContain(MemberApprovalState.APPROVED);
      expect(states).toContain(MemberApprovalState.VERIFIED);
      expect(states).not.toContain(MemberApprovalState.REJECTED);
    });
  });

  describe('modifyOwnSubscription', () => {
    it('scopes the update to the caller so another member cannot be modified', async () => {
      await service.modifyOwnSubscription('sub-1', 'member-1', { isActive: false });

      expect(updateMany).toHaveBeenCalledWith({
        where: { uid: 'sub-1', memberUid: 'member-1' },
        data: { isActive: false },
      });
    });

    it('throws NotFound when the subscription does not belong to the caller', async () => {
      updateMany.mockResolvedValue({ count: 0 });

      await expect(service.modifyOwnSubscription('sub-1', 'intruder', { isActive: false })).rejects.toBeInstanceOf(
        NotFoundException
      );
      expect(cacheReset).not.toHaveBeenCalled();
    });

    it('never lets a modify rewrite ownership or identity', async () => {
      await service.modifyOwnSubscription('sub-1', 'member-1', {
        isActive: false,
        memberUid: 'intruder',
        uid: 'other-sub',
      } as never);

      expect(updateMany).toHaveBeenCalledWith({
        where: { uid: 'sub-1', memberUid: 'member-1' },
        data: { isActive: false },
      });
    });
  });

  describe('subscribe', () => {
    const input = {
      memberUid: 'member-1',
      entityUid: 'loc-1',
      entityType: 'EVENT_LOCATION',
      entityAction: 'Default',
    } as never;

    it('creates a row when the member has none for the entity', async () => {
      await service.subscribe(input);

      expect(create).toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it('reactivates the existing row instead of adding a duplicate', async () => {
      findMany.mockResolvedValue([{ uid: 'sub-1', isActive: false }]);

      await service.subscribe(input);

      expect(create).not.toHaveBeenCalled();
      expect(updateMany).toHaveBeenCalledWith({
        where: { uid: 'sub-1', memberUid: 'member-1' },
        data: { isActive: true },
      });
    });

    it('finds the existing row of a member who is not approved', async () => {
      findMany.mockResolvedValue([{ uid: 'sub-1', isActive: true }]);

      await service.subscribe(input);

      expect(JSON.stringify(findMany.mock.calls[0][0])).not.toContain('memberApproval');
      expect(create).not.toHaveBeenCalled();
    });
  });
});

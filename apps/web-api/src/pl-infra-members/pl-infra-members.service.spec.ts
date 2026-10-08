jest.mock('../analytics/service/analytics.service', () => ({
  AnalyticsService: class AnalyticsService {},
}));
jest.mock('../access-control-v2/services/access-control-v2.service', () => ({
  AccessControlV2Service: class AccessControlV2Service {},
}));

import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { AnalyticsService } from '../analytics/service/analytics.service';
import { PrismaService } from '../shared/prisma.service';
import { ANALYTICS_EVENTS } from '../utils/constants';
import { PL_INFRA_POLICY_CODE } from './pl-infra-members.constants';
import { PlInfraMembersService } from './pl-infra-members.service';

const assignment = (memberUid: string, name: string | null) => ({
  uid: `assignment-${memberUid}`,
  memberUid,
  assignedByUid: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
  member: { uid: memberUid, name, email: `${memberUid}@example.com` },
});

const policy = (assignments: ReturnType<typeof assignment>[]) => ({
  uid: 'policy-uid',
  code: PL_INFRA_POLICY_CODE,
  name: 'PL Infra Team / PL Internal',
  assignments,
});

describe('PlInfraMembersService', () => {
  const getPolicy = jest.fn();
  const trackEvent = jest.fn();
  const memberFindMany = jest.fn();
  let deletedUids: string[];
  let service: PlInfraMembersService;

  beforeEach(() => {
    jest.clearAllMocks();
    deletedUids = [];
    trackEvent.mockResolvedValue(undefined);
    // Echo back the requested uids that are not soft-deleted, like `where: { uid: { in }, deletedAt: null }`.
    memberFindMany.mockImplementation(async ({ where }: { where: { uid: { in: string[] } } }) =>
      where.uid.in.filter((uid) => !deletedUids.includes(uid)).map((uid) => ({ uid }))
    );
    service = new PlInfraMembersService(
      { getPolicy } as unknown as AccessControlV2Service,
      { trackEvent } as unknown as AnalyticsService,
      { member: { findMany: memberFindMany } } as unknown as PrismaService
    );
  });

  it('drops soft-deleted members from the list and the total', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada'), assignment('m2', 'Gone'), assignment('m3', 'Grace')]));
    deletedUids = ['m2'];

    const result = await service.listMembers({ page: 1, limit: 500 });

    expect(memberFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { uid: { in: ['m1', 'm2', 'm3'] }, deletedAt: null } })
    );
    expect(result).toEqual({
      page: 1,
      limit: 500,
      total: 2,
      items: [
        { memberUid: 'm1', name: 'Ada' },
        { memberUid: 'm3', name: 'Grace' },
      ],
    });
  });

  it('throws a clear error, never a partial list, when the soft-delete check fails', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada')]));
    memberFindMany.mockRejectedValue(new Error('connection refused'));

    await expect(service.listMembers({ page: 1, limit: 500 })).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('returns the members holding the PL Infra policy, read from the admin policy view', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada'), assignment('m2', 'Grace')]));

    const result = await service.listMembers({ page: 1, limit: 500 });

    expect(getPolicy).toHaveBeenCalledWith(PL_INFRA_POLICY_CODE);
    expect(result).toEqual({
      page: 1,
      limit: 500,
      total: 2,
      items: [
        { memberUid: 'm1', name: 'Ada' },
        { memberUid: 'm2', name: 'Grace' },
      ],
    });
  });

  it('returns only member id and name, never email or other personal data', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada')]));

    const result = await service.listMembers({ page: 1, limit: 500 });

    expect(Object.keys(result.items[0]).sort()).toEqual(['memberUid', 'name']);
    expect(JSON.stringify(result)).not.toContain('@example.com');
  });

  it('returns success with an empty list when nobody holds the policy', async () => {
    getPolicy.mockResolvedValue(policy([]));

    await expect(service.listMembers({ page: 1, limit: 500 })).resolves.toEqual({
      page: 1,
      limit: 500,
      total: 0,
      items: [],
    });
  });

  it('reads the live list on every call (no cache): a removed member is gone on the next read', async () => {
    getPolicy
      .mockResolvedValueOnce(policy([assignment('m1', 'Ada'), assignment('m2', 'Grace')]))
      .mockResolvedValueOnce(policy([assignment('m1', 'Ada')]));

    const first = await service.listMembers({ page: 1, limit: 500 });
    const second = await service.listMembers({ page: 1, limit: 500 });

    expect(getPolicy).toHaveBeenCalledTimes(2);
    expect(first.items.map((m) => m.memberUid)).toEqual(['m1', 'm2']);
    expect(second.items.map((m) => m.memberUid)).toEqual(['m1']);
  });

  it('pages the list with page and limit while keeping the full total', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'A'), assignment('m2', 'B'), assignment('m3', 'C')]));

    const result = await service.listMembers({ page: 2, limit: 2 });

    expect(result).toEqual({ page: 2, limit: 2, total: 3, items: [{ memberUid: 'm3', name: 'C' }] });
  });

  it('throws a clear error, never an empty list, when the list cannot be loaded', async () => {
    getPolicy.mockRejectedValue(new Error('connection refused'));

    await expect(service.listMembers({ page: 1, limit: 500 })).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('throws a clear error when the PL Infra policy does not exist', async () => {
    getPolicy.mockRejectedValue(new NotFoundException(`Policy not found: ${PL_INFRA_POLICY_CODE}`));

    await expect(service.listMembers({ page: 1, limit: 500 })).rejects.toThrow('PL Infra policy is not configured');
  });

  it('tracks one mcp-pl-infra-list-read event per successful read', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada')]));

    await service.listMembers({ page: 1, limit: 500 });

    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: ANALYTICS_EVENTS.MCP.PL_INFRA_LIST_READ,
        properties: expect.objectContaining({ total: 1, page: 1, limit: 500 }),
      })
    );
  });

  it('still returns the list when analytics tracking fails', async () => {
    getPolicy.mockResolvedValue(policy([assignment('m1', 'Ada')]));
    trackEvent.mockRejectedValue(new Error('posthog down'));

    await expect(service.listMembers({ page: 1, limit: 500 })).resolves.toMatchObject({ total: 1 });
  });
});

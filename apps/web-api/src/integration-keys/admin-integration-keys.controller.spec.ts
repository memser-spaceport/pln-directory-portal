import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import type { IntegrationKeysService } from './integration-keys.service';
import { AdminIntegrationKeysController } from './admin-integration-keys.controller';
import { CreateIntegrationKeyRequestDto } from './integration-keys.dto';

const listItem = {
  uid: 'ik-1',
  name: 'PL ATS',
  teamUid: 'team-1',
  keyPrefix: 'labos_ik_abcdefg',
  scopes: ['jobs:write', 'candidates:read'],
  createdByUid: 'm-1',
  createdAt: '2026-09-16T10:00:00.000Z',
  lastUsedAt: null,
  revokedAt: null,
};

describe('AdminIntegrationKeysController', () => {
  let service: { issue: jest.Mock; listForTeam: jest.Mock; revoke: jest.Mock };
  let controller: AdminIntegrationKeysController;

  beforeEach(() => {
    service = { issue: jest.fn(), listForTeam: jest.fn(), revoke: jest.fn() };
    controller = new AdminIntegrationKeysController(service as unknown as IntegrationKeysService);
  });

  it('is guarded by AdminAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminIntegrationKeysController)).toEqual([AdminAuthGuard]);
  });

  it('creates a key for the team, records the admin from the JWT, and returns the plaintext once', async () => {
    service.issue.mockResolvedValue({ ...listItem, key: 'labos_ik_abcdefg1234' });

    const out = await controller.create(
      { teamUid: 'team-1', name: 'PL ATS', scopes: ['jobs:write', 'candidates:read'] },
      { user: { memberUid: 'm-1' } }
    );

    expect(service.issue).toHaveBeenCalledWith({
      teamUid: 'team-1',
      name: 'PL ATS',
      scopes: ['jobs:write', 'candidates:read'],
      createdByUid: 'm-1',
    });
    expect(out).toMatchObject({ uid: 'ik-1', key: 'labos_ik_abcdefg1234', keyPrefix: 'labos_ik_abcdefg' });
  });

  it('rejects a request with a scope outside the allowed set or an empty scope list with 422', () => {
    // ZodValidationPipe answers invalid input with 422 across the API's admin routes.
    const pipe = new ZodValidationPipe();
    const meta = { type: 'body' as const, metatype: CreateIntegrationKeyRequestDto };
    expect(() => pipe.transform({ teamUid: 'team-1', name: 'x', scopes: ['admin'] }, meta)).toThrow(
      UnprocessableEntityException
    );
    expect(() => pipe.transform({ teamUid: 'team-1', name: 'x', scopes: [] }, meta)).toThrow(
      UnprocessableEntityException
    );
    expect(() => pipe.transform({ teamUid: 'team-1', name: 'x', scopes: ['jobs:write', 'jobs:write'] }, meta)).toThrow(
      UnprocessableEntityException
    );
    expect(pipe.transform({ teamUid: 'team-1', name: 'x', scopes: ['jobs:write'] }, meta)).toEqual({
      teamUid: 'team-1',
      name: 'x',
      scopes: ['jobs:write'],
    });
  });

  it('propagates 404 for an unknown team', async () => {
    service.issue.mockRejectedValue(new NotFoundException());
    await expect(
      controller.create({ teamUid: 'nope', name: 'x', scopes: ['jobs:write'] }, { user: { memberUid: 'm-1' } })
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lists a team’s keys without any secret field', async () => {
    service.listForTeam.mockResolvedValue([
      listItem,
      { ...listItem, uid: 'ik-2', revokedAt: '2026-09-16T11:00:00.000Z' },
    ]);
    const out = await controller.list({ teamUid: 'team-1' });
    expect(service.listForTeam).toHaveBeenCalledWith('team-1');
    expect(out).toHaveLength(2);
    for (const item of out) {
      expect(item).not.toHaveProperty('key');
      expect(item).not.toHaveProperty('keyHash');
    }
  });

  it('revokes by uid and propagates 404 for an unknown uid', async () => {
    service.revoke.mockResolvedValueOnce({ ...listItem, revokedAt: '2026-09-16T12:00:00.000Z' });
    await expect(controller.revoke('ik-1')).resolves.toMatchObject({ revokedAt: '2026-09-16T12:00:00.000Z' });
    service.revoke.mockRejectedValueOnce(new NotFoundException());
    await expect(controller.revoke('nope')).rejects.toBeInstanceOf(NotFoundException);
  });
});

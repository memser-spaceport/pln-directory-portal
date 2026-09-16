import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import type { PrismaService } from '../shared/prisma.service';
import {
  INTEGRATION_KEY_DISPLAY_PREFIX_LENGTH,
  INTEGRATION_KEY_PREFIX,
  IntegrationKeysService,
  hashIntegrationKey,
} from './integration-keys.service';

const row = (overrides: Record<string, unknown> = {}) => ({
  uid: 'ik-1',
  name: 'PL ATS',
  teamUid: 'team-1',
  keyPrefix: 'labos_ik_abcdefg',
  scopes: ['jobs:write', 'candidates:read'],
  createdByUid: 'm-1',
  createdAt: new Date('2026-09-16T10:00:00.000Z'),
  lastUsedAt: null,
  revokedAt: null,
  ...overrides,
});

describe('IntegrationKeysService', () => {
  let prisma: {
    team: { findUnique: jest.Mock };
    integrationKey: { create: jest.Mock; findMany: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  };
  let service: IntegrationKeysService;

  beforeEach(() => {
    prisma = {
      team: { findUnique: jest.fn() },
      integrationKey: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    };
    service = new IntegrationKeysService(prisma as unknown as PrismaService);
  });

  describe('issue', () => {
    it('stores a sha256 hash and a display prefix, and returns the plaintext once', async () => {
      prisma.team.findUnique.mockResolvedValue({ uid: 'team-1' });
      prisma.integrationKey.create.mockImplementation(async ({ data }) => row({ keyPrefix: data.keyPrefix }));

      const out = await service.issue({
        teamUid: 'team-1',
        name: 'PL ATS',
        scopes: ['jobs:write', 'candidates:read'],
        createdByUid: 'm-1',
      });

      const { data } = prisma.integrationKey.create.mock.calls[0][0];
      expect(out.key.startsWith(INTEGRATION_KEY_PREFIX)).toBe(true);
      expect(out.key.length).toBeGreaterThan(INTEGRATION_KEY_PREFIX.length + 40);
      expect(data.keyHash).toBe(createHash('sha256').update(out.key).digest('hex'));
      expect(data.keyPrefix).toBe(out.key.slice(0, INTEGRATION_KEY_DISPLAY_PREFIX_LENGTH));
      expect(data).not.toHaveProperty('key');
      expect(data).toMatchObject({ teamUid: 'team-1', name: 'PL ATS', createdByUid: 'm-1' });
      expect(out).toMatchObject({ uid: 'ik-1', keyPrefix: out.key.slice(0, INTEGRATION_KEY_DISPLAY_PREFIX_LENGTH) });
      expect(out).not.toHaveProperty('keyHash');
    });

    it('generates a different key and hash each time', async () => {
      prisma.team.findUnique.mockResolvedValue({ uid: 'team-1' });
      prisma.integrationKey.create.mockResolvedValue(row());
      const a = await service.issue({ teamUid: 'team-1', name: 'a', scopes: ['jobs:write'], createdByUid: null });
      const b = await service.issue({ teamUid: 'team-1', name: 'b', scopes: ['jobs:write'], createdByUid: null });
      expect(a.key).not.toBe(b.key);
      expect(prisma.integrationKey.create.mock.calls[0][0].data.keyHash).not.toBe(
        prisma.integrationKey.create.mock.calls[1][0].data.keyHash
      );
    });

    it('rejects an unknown team with 404 and stores nothing', async () => {
      prisma.team.findUnique.mockResolvedValue(null);
      await expect(
        service.issue({ teamUid: 'nope', name: 'x', scopes: ['jobs:write'], createdByUid: 'm-1' })
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.integrationKey.create).not.toHaveBeenCalled();
    });
  });

  describe('listForTeam', () => {
    it('returns keys without secret fields, ISO dates, revoked ones included', async () => {
      prisma.integrationKey.findMany.mockResolvedValue([
        row(),
        row({ uid: 'ik-2', revokedAt: new Date('2026-09-16T11:00:00.000Z') }),
      ]);
      const out = await service.listForTeam('team-1');
      expect(out).toHaveLength(2);
      expect(out[0]).toMatchObject({ uid: 'ik-1', revokedAt: null, createdAt: '2026-09-16T10:00:00.000Z' });
      expect(out[1]).toMatchObject({ uid: 'ik-2', revokedAt: '2026-09-16T11:00:00.000Z' });
      for (const item of out) {
        expect(item).not.toHaveProperty('key');
        expect(item).not.toHaveProperty('keyHash');
      }
      expect(prisma.integrationKey.findMany.mock.calls[0][0].where).toEqual({ teamUid: 'team-1' });
    });
  });

  describe('revoke', () => {
    it('sets revokedAt on an active key', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(row());
      prisma.integrationKey.update.mockResolvedValue(row({ revokedAt: new Date('2026-09-16T12:00:00.000Z') }));
      const out = await service.revoke('ik-1');
      expect(prisma.integrationKey.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { uid: 'ik-1' }, data: { revokedAt: expect.any(Date) } })
      );
      expect(out.revokedAt).toBe('2026-09-16T12:00:00.000Z');
    });

    it('is idempotent on an already-revoked key', async () => {
      const revokedAt = new Date('2026-09-16T11:00:00.000Z');
      prisma.integrationKey.findUnique.mockResolvedValue(row({ revokedAt }));
      const out = await service.revoke('ik-1');
      expect(prisma.integrationKey.update).not.toHaveBeenCalled();
      expect(out.revokedAt).toBe(revokedAt.toISOString());
    });

    it('rejects an unknown uid with 404', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(null);
      await expect(service.revoke('nope')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('authenticate', () => {
    it('looks up by the sha256 of the presented key and returns the request context', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(row({ lastUsedAt: new Date() }));
      const ctx = await service.authenticate('labos_ik_secret');
      expect(prisma.integrationKey.findUnique.mock.calls[0][0].where).toEqual({
        keyHash: hashIntegrationKey('labos_ik_secret'),
      });
      expect(ctx).toEqual({
        uid: 'ik-1',
        teamUid: 'team-1',
        scopes: ['jobs:write', 'candidates:read'],
        name: 'PL ATS',
        keyPrefix: 'labos_ik_abcdefg',
      });
    });

    it('returns null for an unknown key', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(null);
      await expect(service.authenticate('nope')).resolves.toBeNull();
    });

    it('returns null for a revoked key', async () => {
      prisma.integrationKey.findUnique.mockResolvedValue(row({ revokedAt: new Date() }));
      await expect(service.authenticate('labos_ik_secret')).resolves.toBeNull();
      expect(prisma.integrationKey.update).not.toHaveBeenCalled();
    });

    it('writes lastUsedAt when never used or older than a minute, and skips it otherwise', async () => {
      prisma.integrationKey.findUnique.mockResolvedValueOnce(row({ lastUsedAt: null }));
      await service.authenticate('k');
      expect(prisma.integrationKey.update).toHaveBeenCalledTimes(1);
      expect(prisma.integrationKey.update.mock.calls[0][0]).toMatchObject({
        where: { uid: 'ik-1' },
        data: { lastUsedAt: expect.any(Date) },
      });

      prisma.integrationKey.findUnique.mockResolvedValueOnce(row({ lastUsedAt: new Date(Date.now() - 120_000) }));
      await service.authenticate('k');
      expect(prisma.integrationKey.update).toHaveBeenCalledTimes(2);

      prisma.integrationKey.findUnique.mockResolvedValueOnce(row({ lastUsedAt: new Date(Date.now() - 10_000) }));
      await service.authenticate('k');
      expect(prisma.integrationKey.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('assertKeyOwnsTeam', () => {
    const key = { uid: 'ik-1', teamUid: 'team-a', scopes: [], name: 'x', keyPrefix: 'p' } as const;

    it('passes for the key’s own team', () => {
      expect(() => service.assertKeyOwnsTeam({ ...key, scopes: [] }, 'team-a')).not.toThrow();
    });

    it('rejects another team with 403', () => {
      expect(() => service.assertKeyOwnsTeam({ ...key, scopes: [] }, 'team-b')).toThrow(ForbiddenException);
    });

    it('rejects a missing team with 403', () => {
      expect(() => service.assertKeyOwnsTeam({ ...key, scopes: [] }, null)).toThrow(ForbiddenException);
      expect(() => service.assertKeyOwnsTeam({ ...key, scopes: [] }, undefined)).toThrow(ForbiddenException);
    });
  });

  describe('describe', () => {
    it('returns the key identity with its team name and no secret fields', async () => {
      prisma.team.findUnique.mockResolvedValue({ name: 'Protocol Labs' });
      const out = await service.describe({
        uid: 'ik-1',
        teamUid: 'team-1',
        scopes: ['jobs:write'],
        name: 'PL ATS',
        keyPrefix: 'labos_ik_abcdefg',
      });
      expect(out).toEqual({
        uid: 'ik-1',
        keyPrefix: 'labos_ik_abcdefg',
        name: 'PL ATS',
        teamUid: 'team-1',
        teamName: 'Protocol Labs',
        scopes: ['jobs:write'],
      });
    });
  });
});

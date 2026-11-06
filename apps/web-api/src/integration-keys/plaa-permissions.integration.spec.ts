import { CACHE_MANAGER, INestApplication, Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import supertest from 'supertest';
import { AccessControlV2Service } from '../access-control-v2/services/access-control-v2.service';
import { MemberApprovalsService } from '../member-approvals/member-approvals.service';
import { PrismaService } from '../shared/prisma.service';
import { IntegrationKeyGuard } from '../guards/integration-key.guard';
import { IntegrationKeysService } from './integration-keys.service';
import { PlaaAccessController } from './plaa-access.controller';

/**
 * HTTP-level test of the PLAA routes with the real guard, body validation,
 * AccessControlV2Service and MemberApprovalsService. Only Prisma is replaced
 * by an in-memory store. Built with NestFactory because `@nestjs/testing` 9.0
 * does not support guards on `@nestjs/core` 9.4.
 */
class InMemoryPrisma {
  members = new Set<string>();
  approvals = new Map<string, string>();
  permissions = new Map<string, { uid: string; code: string }>();
  grants = new Map<string, { memberUid: string; permissionUid: string; reason: string | null }>();

  private key = (w: { memberUid: string; permissionUid: string }) => `${w.memberUid}|${w.permissionUid}`;

  member = {
    findUnique: async ({ where }: { where: { uid: string } }) =>
      this.members.has(where.uid) ? { uid: where.uid } : null,
  };
  memberApproval = {
    findUnique: async ({ where }: { where: { memberUid: string } }) =>
      this.approvals.has(where.memberUid) ? { state: this.approvals.get(where.memberUid) } : null,
  };
  permission = {
    findUnique: async ({ where }: { where: { code: string } }) => this.permissions.get(where.code) ?? null,
  };
  memberPermissionV2 = {
    findUnique: async ({
      where,
    }: {
      where: { memberUid_permissionUid: { memberUid: string; permissionUid: string } };
    }) => this.grants.get(this.key(where.memberUid_permissionUid)) ?? null,
    upsert: async ({
      where,
      create,
      update,
    }: {
      where: { memberUid_permissionUid: { memberUid: string; permissionUid: string } };
      create: { memberUid: string; permissionUid: string; reason: string | null };
      update: { reason: string | null };
    }) => {
      const k = this.key(where.memberUid_permissionUid);
      const existing = this.grants.get(k);
      const row = existing ? { ...existing, ...update } : create;
      this.grants.set(k, row);
      return row;
    },
    delete: async ({ where }: { where: { memberUid_permissionUid: { memberUid: string; permissionUid: string } } }) => {
      this.grants.delete(this.key(where.memberUid_permissionUid));
    },
  };

  permissionsOf(memberUid: string): string[] {
    return [...this.grants.values()]
      .filter((g) => g.memberUid === memberUid)
      .map((g) => g.permissionUid)
      .sort();
  }
}

const PLAA_SCOPE = 'plaa:access:manage';
const KEYS: Record<string, string[]> = {
  'Bearer plaa-key': [PLAA_SCOPE],
  'Bearer jobs-key': ['jobs:write'],
};

describe('PLAA permission management (integration)', () => {
  let app: INestApplication;
  let db: InMemoryPrisma;
  const http = () => supertest(app.getHttpServer());

  beforeAll(async () => {
    db = new InMemoryPrisma();
    @Module({
      controllers: [PlaaAccessController],
      providers: [
        AccessControlV2Service,
        MemberApprovalsService,
        IntegrationKeyGuard,
        { provide: PrismaService, useValue: db },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: CACHE_MANAGER, useValue: { get: jest.fn(), set: jest.fn(), del: jest.fn() } },
        {
          provide: IntegrationKeysService,
          useValue: {
            authenticate: async (presented: string) => {
              const scopes = KEYS[`Bearer ${presented}`];
              return scopes ? { uid: `uid-${presented}`, teamUid: 'team-1', scopes } : null;
            },
          },
        },
      ],
    })
    class PlaaTestModule {}
    app = await NestFactory.create(PlaaTestModule, { logger: false });
    await app.init();
  });

  afterAll(() => app?.close());

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    db.members = new Set(['approved', 'verified', 'pending', 'no-approval']);
    db.approvals = new Map([
      ['approved', 'APPROVED'],
      ['verified', 'VERIFIED'],
      ['pending', 'PENDING'],
    ]);
    db.permissions = new Map(
      ['plaa.access', 'plaa.guest', 'plaa.member', 'directory.admin.full', 'admin.tools.access'].map((code) => [
        code,
        { uid: code, code },
      ])
    );
    db.grants = new Map();
  });
  afterEach(() => jest.restoreAllMocks());

  const grant = (member: string, body: unknown, auth = 'Bearer plaa-key') =>
    http()
      .post(`/v1/integrations/plaa/members/${member}/permissions/grant`)
      .set('Authorization', auth)
      .send(body as object);
  const revoke = (member: string, body: unknown, auth = 'Bearer plaa-key') =>
    http()
      .post(`/v1/integrations/plaa/members/${member}/permissions/revoke`)
      .set('Authorization', auth)
      .send(body as object);

  it.each(['plaa.access', 'plaa.guest', 'plaa.member'])('UC-01 grants only %s', async (permission) => {
    await grant('approved', { permission }).expect(200, { ok: true, permission });
    expect(db.permissionsOf('approved')).toEqual([permission]);
  });

  it('UC-01 accepts VERIFIED members', async () => {
    await grant('verified', { permission: 'plaa.member' }).expect(200);
    expect(db.permissionsOf('verified')).toEqual(['plaa.member']);
  });

  it('UC-02/UC-03 revokes one permission and keeps the others', async () => {
    for (const permission of ['plaa.access', 'plaa.guest', 'plaa.member']) {
      await grant('approved', { permission }).expect(200);
    }
    await revoke('approved', { permission: 'plaa.guest' }).expect(200, {
      ok: true,
      removed: true,
      permission: 'plaa.guest',
    });
    expect(db.permissionsOf('approved')).toEqual(['plaa.access', 'plaa.member']);
  });

  it.each(['pending', 'no-approval'])('UC-04 rejects a %s member and grants nothing', async (member) => {
    await grant(member, { permission: 'plaa.member' }).expect(403);
    expect(db.grants.size).toBe(0);
  });

  it('rejects an unknown member (approval check runs first on grant)', async () => {
    await grant('ghost', { permission: 'plaa.member' }).expect(403);
    await revoke('ghost', { permission: 'plaa.member' }).expect(404);
  });

  describe('UC-05 authorization', () => {
    it.each([
      ['missing key', undefined, 401],
      ['unknown key', 'Bearer wrong-key', 401],
      ['key without PLAA scope', 'Bearer jobs-key', 403],
    ])('%s is rejected on grant and revoke', async (_label, auth, status) => {
      db.grants.set('approved|plaa.member', { memberUid: 'approved', permissionUid: 'plaa.member', reason: null });
      const post = (path: string) => {
        const r = http()
          .post(`/v1/integrations/plaa/members/approved/permissions/${path}`)
          .send({ permission: 'plaa.member' });
        return auth ? r.set('Authorization', auth) : r;
      };
      await post('grant').expect(status);
      await post('revoke').expect(status);
      await (auth
        ? http().post('/v1/integrations/plaa/members/approved/access').set('Authorization', auth)
        : http().post('/v1/integrations/plaa/members/approved/access')
      ).expect(status);
      expect(db.permissionsOf('approved')).toEqual(['plaa.member']);
    });

    it('checks the key before validating the body', async () => {
      await grant('approved', { permission: 'admin.access' }, 'Bearer jobs-key').expect(403);
    });
  });

  describe('UC-06 rejects non-PLAA or malformed permissions', () => {
    it.each([
      [{ permission: 'admin.access' }],
      [{ permission: 'directory.admin.full' }],
      [{ permission: 'admin.tools.access' }],
      [{ permission: 'plaa.admin' }],
      [{ permission: 'PLAA.MEMBER' }],
      [{ permission: ['plaa.member'] }],
      [{ permission: 1 }],
      [{ permissions: ['plaa.member'] }],
      [{}],
    ])('%j', async (body) => {
      await grant('approved', body).expect(422);
      await revoke('approved', body).expect(422);
      expect(db.grants.size).toBe(0);
    });
  });

  describe('UC-07 legacy /access routes', () => {
    it('manage only plaa.access, with the same responses as before', async () => {
      await grant('approved', { permission: 'plaa.member' }).expect(200);
      await http()
        .post('/v1/integrations/plaa/members/approved/access')
        .set('Authorization', 'Bearer plaa-key')
        .expect(200, { ok: true });
      expect(db.permissionsOf('approved')).toEqual(['plaa.access', 'plaa.member']);
      await http()
        .delete('/v1/integrations/plaa/members/approved/access')
        .set('Authorization', 'Bearer plaa-key')
        .expect(200, { ok: true, removed: true });
      await http()
        .delete('/v1/integrations/plaa/members/approved/access')
        .set('Authorization', 'Bearer plaa-key')
        .expect(200, { ok: true, removed: false });
      expect(db.permissionsOf('approved')).toEqual(['plaa.member']);
    });

    it('still enforces approval', async () => {
      await http()
        .post('/v1/integrations/plaa/members/pending/access')
        .set('Authorization', 'Bearer plaa-key')
        .expect(403);
      expect(db.grants.size).toBe(0);
    });

    it('interoperate with the generic routes on plaa.access', async () => {
      await http()
        .post('/v1/integrations/plaa/members/approved/access')
        .set('Authorization', 'Bearer plaa-key')
        .expect(200);
      await revoke('approved', { permission: 'plaa.access' }).expect(200, {
        ok: true,
        removed: true,
        permission: 'plaa.access',
      });
      expect(db.permissionsOf('approved')).toEqual([]);
    });
  });

  describe('UC-08 idempotency', () => {
    it('repeated grants keep a single assignment', async () => {
      await grant('approved', { permission: 'plaa.guest' }).expect(200);
      await grant('approved', { permission: 'plaa.guest' }).expect(200);
      expect(db.permissionsOf('approved')).toEqual(['plaa.guest']);
      expect(db.grants.size).toBe(1);
    });

    it('repeated revokes are safe', async () => {
      await grant('approved', { permission: 'plaa.guest' }).expect(200);
      await revoke('approved', { permission: 'plaa.guest' }).expect(200, {
        ok: true,
        removed: true,
        permission: 'plaa.guest',
      });
      await revoke('approved', { permission: 'plaa.guest' }).expect(200, {
        ok: true,
        removed: false,
        permission: 'plaa.guest',
      });
      await revoke('approved', { permission: 'plaa.member' }).expect(200, {
        ok: true,
        removed: false,
        permission: 'plaa.member',
      });
      expect(db.grants.size).toBe(0);
    });
  });
});

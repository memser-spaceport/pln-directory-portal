jest.mock('axios', () => ({ post: jest.fn() }));

import { INestApplication, Module, UnauthorizedException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import axios from 'axios';
import { RbacController } from './rbac.controller';
import { RbacService } from './rbac.service';

const FIRST = { uid: 'first-member', email: 'first@example.com', name: 'First', roles: ['DIRECTORYADMIN'] };
const ADA = { uid: 'ada', email: 'ada@example.com', name: 'Ada', roles: ['MEMBER'] };

const prisma = {
  member: {
    findFirst: jest.fn(async ({ where }: { where: { email?: { equals?: string } } }) => {
      const email = where?.email?.equals;
      if (typeof email !== 'string' || email.trim() === '') {
        return { uid: FIRST.uid, email: FIRST.email, name: FIRST.name };
      }
      const row = [FIRST, ADA].find((member) => member.email === email.toLowerCase());
      return row ? { uid: row.uid, email: row.email, name: row.name } : null;
    }),
  },
  roleAssignment: {
    findMany: jest.fn(async ({ where }: { where: { memberUid: string } }) => {
      const row = [FIRST, ADA].find((member) => member.uid === where.memberUid);
      return (row?.roles ?? []).map((code) => ({ role: { code, rolePermissions: [] } }));
    }),
  },
  memberPermission: {
    findMany: jest.fn(async () => []),
  },
};

describe('GET /v1/rbac/me', () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      controllers: [RbacController],
      providers: [{ provide: RbacService, useValue: new RbacService(prisma as never) }],
    })
    class RbacMeTestModule {}

    app = await NestFactory.create(RbacMeTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('returns 401 when the request has no token and does not query members', async () => {
    await request(app.getHttpServer()).get('/v1/rbac/me').expect(401);
    expect(axios.post).not.toHaveBeenCalled();
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });

  it('returns only the roles of the member in the token', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true, email: ADA.email, sub: ADA.uid },
    });

    const response = await request(app.getHttpServer())
      .get('/v1/rbac/me')
      .set('Authorization', 'Bearer ada-token')
      .expect(200);

    expect(response.body).toMatchObject({ memberUid: ADA.uid, roles: ['MEMBER'] });
    expect(response.body.roles).not.toContain('DIRECTORYADMIN');
    expect(prisma.member.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { email: { equals: ADA.email, mode: 'insensitive' } },
      })
    );
  });

  it('does not query when the email is empty', async () => {
    const service = app.get(RbacService);
    await expect(service.findMemberByEmail(undefined as unknown as string)).rejects.toBeInstanceOf(
      UnauthorizedException
    );
    await expect(service.findMemberByEmail('')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.findMemberByEmail('   ')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.member.findFirst).not.toHaveBeenCalled();
  });
});

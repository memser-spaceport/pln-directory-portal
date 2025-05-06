import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseMemberWithRelationsSchema } from 'libs/contracts/src/schema';
import { createMember } from './__mocks__/members.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe.skip('Members', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createMember({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all members', () => {
    it('should list all the members with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/members')
        .expect(200);
      const members = response.body;
      expect(members).toHaveLength(5);
      const hasValidSchema =
        ResponseMemberWithRelationsSchema.array().safeParse(members).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the members with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/members?invalid=true')
          .expect(200);
        const members = response.body;
        expect(members).toHaveLength(5);
        const hasValidSchema =
          ResponseMemberWithRelationsSchema.array().safeParse(members).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered members with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/members?email__endswith=1@mail.com&with=location')
          .expect(200);
        const members = response.body;
        expect(members).toHaveLength(1);
        const hasValidSchema =
          ResponseMemberWithRelationsSchema.array().safeParse(members).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });

  describe('When getting an member by uid', () => {
    it('should return the member with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/members/uid-1')
        .expect(200);
      const member = response.body;
      const hasValidSchema =
        ResponseMemberWithRelationsSchema.safeParse(member).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a member by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/uid-6').expect(404);
    });
  });

  describe('When getting a member with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/123').expect(404);
    });
  });
});

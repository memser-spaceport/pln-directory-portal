import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseMembershipSourceSchema } from 'libs/contracts/src/schema/membership-source';
import { createMembershipSource } from './__mocks__/membership-sources.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Membership Sources', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createMembershipSource({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all membership sources', () => {
    it('should list all the membership sources with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/membership-sources')
        .expect(200);
      const membershipSources = response.body;
      expect(membershipSources).toHaveLength(5);
      const hasValidSchema =
        ResponseMembershipSourceSchema.array().safeParse(
          membershipSources
        ).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the membership sources with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/membership-sources?invalid=true')
          .expect(200);
        const membershipSources = response.body;
        expect(membershipSources).toHaveLength(5);
        const hasValidSchema =
          ResponseMembershipSourceSchema.array().safeParse(
            membershipSources
          ).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered membership sources with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/membership-sources?title=Membership+Source+1')
          .expect(200);
        const membershipSources = response.body;
        expect(membershipSources).toHaveLength(1);
        const hasValidSchema =
          ResponseMembershipSourceSchema.array().safeParse(
            membershipSources
          ).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });
  describe('When getting an membership source by uid', () => {
    it('should return the membership source with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/membership-sources/uid-1')
        .expect(200);
      const membershipSource = response.body;
      const hasValidSchema =
        ResponseMembershipSourceSchema.safeParse(membershipSource).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an membership source by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/membership-sources/uid-6')
        .expect(404);
    });
  });
  describe('When getting an membership source with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/membership-sources/123')
        .expect(404);
    });
  });
  describe('When getting a membership source by uid with valid characters and special characters', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/membership-sources/%7Bfoo:"bar"%7D')
        .expect(404);
    });
  });
});

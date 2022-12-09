import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseTechnologySchema } from 'libs/contracts/src/schema/technology';
import { createTechnology } from './__mocks__/technologies.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Technologies', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createTechnology({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all technologies', () => {
    it('should list all the technologies with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/technologies')
        .expect(200);
      const technologies = response.body;
      expect(technologies).toHaveLength(5);
      const hasValidSchema =
        ResponseTechnologySchema.array().safeParse(technologies).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the technologies with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/technologies?invalid=true')
          .expect(200);
        const technologies = response.body;
        expect(technologies).toHaveLength(5);
        const hasValidSchema =
          ResponseTechnologySchema.array().safeParse(technologies).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered technologies with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/technologies?title=Technology+1')
          .expect(200);
        const technologies = response.body;
        expect(technologies).toHaveLength(1);
        const hasValidSchema =
          ResponseTechnologySchema.array().safeParse(technologies).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });
  describe('When getting a technology by uid', () => {
    it('should return the technology with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/technologies/uid-1')
        .expect(200);
      const technology = response.body;
      const hasValidSchema =
        ResponseTechnologySchema.safeParse(technology).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a technology by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/technologies/uid-6')
        .expect(404);
    });
  });
  describe('When getting a technology with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/technologies/123')
        .expect(404);
    });
  });
});

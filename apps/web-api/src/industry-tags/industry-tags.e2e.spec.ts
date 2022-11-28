import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseIndustryTagSchema } from 'libs/contracts/src/schema';
import { createIndustryTags } from './__mocks__/industry-tags.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Industry Tags', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createIndustryTags({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all industry tags', () => {
    it('should list all the industry tags with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/industry-tags')
        .expect(200);
      const tags = response.body;
      expect(tags).toHaveLength(5);
      const hasValidSchema =
        ResponseIndustryTagSchema.array().safeParse(tags).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the industry tags with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/industry-tags?invalid=true')
          .expect(200);
        const tags = response.body;
        expect(tags).toHaveLength(5);
        const hasValidSchema =
          ResponseIndustryTagSchema.array().safeParse(tags).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered industry tags with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/industry-tags?title=Industry+Tag+2')
          .expect(200);
        const tags = response.body;
        expect(tags).toHaveLength(1);
        const hasValidSchema =
          ResponseIndustryTagSchema.array().safeParse(tags).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });
  describe('When getting an industry tag by uid', () => {
    it('should return the industry tag with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/industry-tags/uid-1')
        .expect(200);
      const tag = response.body;
      const hasValidSchema = ResponseIndustryTagSchema.safeParse(tag).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an industry tag by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/industry-tags/uid-6')
        .expect(404);
    });
  });
  describe('When getting an undustry tag with an uid with only numbers', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/industry-tags/123')
        .expect(404);
    });
  });

  describe('When getting an industry tag by uid with valid character and special characters', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/industry-tags/%7Bfoo:"bar"%7D')
        .expect(404);
    });
  });
});

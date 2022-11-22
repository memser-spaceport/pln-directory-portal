import supertest from 'supertest';
import { INestApplication } from '@nestjs/common';
import { Cache } from 'cache-manager';
import { LocationResponseSchema } from 'libs/contracts/src/schema';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';
import { createLocation } from './__mocks__/locations.mocks';

describe('Locations', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createLocation({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('when getting all locations', () => {
    it('should list all the locations with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/locations')
        .expect(200);
      const locations = response.body;
      expect(locations).toHaveLength(5);
      LocationResponseSchema.array().parse(locations);
      const hasValidSchema =
        LocationResponseSchema.array().safeParse(locations).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
});

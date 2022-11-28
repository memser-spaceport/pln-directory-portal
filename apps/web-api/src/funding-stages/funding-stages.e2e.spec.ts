import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseFundingStageSchema } from 'libs/contracts/src/schema';
import { createFundingStage } from './__mocks__/funding-stages.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Funding Stages', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createFundingStage({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all funding stages', () => {
    it('should list all the funding stages with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/funding-stages')
        .expect(200);
      const fundingStages = response.body;
      expect(fundingStages).toHaveLength(5);
      const hasValidSchema =
        ResponseFundingStageSchema.array().safeParse(fundingStages).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the funding stages with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/funding-stages?invalid=true')
          .expect(200);
        const fundingStages = response.body;
        expect(fundingStages).toHaveLength(5);
        const hasValidSchema =
          ResponseFundingStageSchema.array().safeParse(fundingStages).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered funding stages with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/funding-stages?title__iendswith=Stage+1')
          .expect(200);
        const fundingStages = response.body;
        expect(fundingStages).toHaveLength(1);
        const hasValidSchema =
          ResponseFundingStageSchema.array().safeParse(fundingStages).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });

  describe('When getting a funding stage by uid', () => {
    it('should return the funding stage with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/funding-stages/uid-1')
        .expect(200);
      const fundingStage = response.body;
      const hasValidSchema =
        ResponseFundingStageSchema.safeParse(fundingStage).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting a funding stage by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/funding-stages/uid-6')
        .expect(404);
    });
  });
  describe('When getting a funding stage with an uid with only numbers', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/funding-stages/123')
        .expect(404);
    });
  });
  describe('When getting a funding stage by uid with valid characters and special characters', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/industry-tags/uid-1@,/;')
        .expect(404);
    });
  });
});

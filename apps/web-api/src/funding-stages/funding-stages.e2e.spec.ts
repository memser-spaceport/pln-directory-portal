import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FundingStageSchema } from 'libs/contracts/src/schema';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { FundingStagesModule } from './funding-stages.module';
import { createFundingStage } from './__mocks__/funding-stages.mocks';

describe('Funding Stages', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FundingStagesModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();
    await createFundingStage({ amount: 5 });
  });

  describe('When getting all funding stages', () => {
    it('should list all the funding stages with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/funding-stages')
        .expect(200);
      const fundingStages = response.body;
      expect(fundingStages).toHaveLength(5);
      const hasValidSchema =
        FundingStageSchema.array().safeParse(fundingStages).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a funding stage by uid', () => {
    it('should return the funding stage with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/funding-stages/uid-1')
        .expect(200);
      const fundingStage = response.body;
      const hasValidSchema = FundingStageSchema.safeParse(fundingStage).success;
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

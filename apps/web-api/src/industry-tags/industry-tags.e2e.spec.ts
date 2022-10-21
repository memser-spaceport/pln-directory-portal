import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { IndustryTagSchema } from 'libs/contracts/src/schema';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { IndustryTagsModule } from './industry-tags.module';
import { createIndustryTags } from './__mocks__/industry-tags.mocks';

describe('Industry Tags', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [IndustryTagsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();
    await createIndustryTags({ amount: 5 });
  });

  describe('When getting all industry tags', () => {
    it('should list all the industry tags with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/industry-tags')
        .expect(200);
      const tags = response.body;
      expect(tags).toHaveLength(5);
      const hasValidSchema = IndustryTagSchema.array().safeParse(tags).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an industry tag by uid', () => {
    it('should return the industry tag with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/industry-tags/uid-1')
        .expect(200);
      const tag = response.body;
      const hasValidSchema = IndustryTagSchema.safeParse(tag).success;
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

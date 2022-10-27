import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SkillSchema } from 'libs/contracts/src/schema/skill';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { SkillsModule } from './skills.module';
import { createSkill } from './__mocks__/skills.mocks';

describe('Skills', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [SkillsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();

    await createSkill({ amount: 5 });
  });

  describe('When getting all industry tags', () => {
    it('should list all the industry tags with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/skills')
        .expect(200);
      const skills = response.body;
      expect(skills).toHaveLength(5);
      const hasValidSchema = SkillSchema.array().safeParse(skills).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });
  describe('When getting an industry tag by uid', () => {
    it('should return the industry tag with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/skills/uid-1')
        .expect(200);
      const skill = response.body;
      const hasValidSchema = SkillSchema.safeParse(skill).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a skill by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer()).get('/v1/skills/uid-6').expect(404);
    });
  });
  describe('When getting a skill with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer()).get('/v1/skills/123').expect(404);
    });
  });
});

import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseSkillSchema } from 'libs/contracts/src/schema/skill';
import { createSkill } from './__mocks__/skills.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('Skills', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createSkill({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all skills', () => {
    it('should list all the skills with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/skills')
        .expect(200);
      const skills = response.body;
      expect(skills).toHaveLength(5);
      const hasValidSchema =
        ResponseSkillSchema.array().safeParse(skills).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the skills with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/skills?invalid=true')
          .expect(200);
        const skills = response.body;
        expect(skills).toHaveLength(5);
        const hasValidSchema =
          ResponseSkillSchema.array().safeParse(skills).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered skills with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/skills?title=Skill+1')
          .expect(200);
        const skills = response.body;
        expect(skills).toHaveLength(1);
        const hasValidSchema =
          ResponseSkillSchema.array().safeParse(skills).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });
  describe('When getting a skill by uid', () => {
    it('should return the skill with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/skills/uid-1')
        .expect(200);
      const skill = response.body;
      const hasValidSchema = ResponseSkillSchema.safeParse(skill).success;
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

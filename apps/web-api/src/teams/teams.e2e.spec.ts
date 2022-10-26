import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TeamSchema } from 'libs/contracts/src/schema/team';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { TeamsModule } from './teams.module';
import { createTeam } from './__mocks__/teams.mocks';

describe('TeamsService', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TeamsModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();

    await createTeam({ amount: 5 });
  });

  describe('When getting all teams', () => {
    it('should list all the teams with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/teams')
        .expect(200);
      const teams = response.body;
      expect(teams).toHaveLength(5);
      const hasValidSchema = TeamSchema.array().safeParse(teams).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting an team by uid', () => {
    it('should return the team with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/teams/uid-1')
        .expect(200);
      const team = response.body;
      const hasValidSchema = TeamSchema.safeParse(team).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a team by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer()).get('/v1/teams/uid-6').expect(404);
    });
  });
  describe('When getting a team with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer()).get('/v1/teams/123').expect(404);
    });
  });
});

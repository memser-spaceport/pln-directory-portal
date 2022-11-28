import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication } from '@nestjs/common';
import { ResponseTeamWithRelationsSchema } from 'libs/contracts/src/schema/team';
import { createTeam } from './__mocks__/teams.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

describe('TeamsService', () => {
  let app: INestApplication;
  let cacheManager: Cache;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createTeam({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  describe('When getting all teams', () => {
    it('should list all the teams with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/teams')
        .expect(200);
      const teams = response.body;
      expect(teams).toHaveLength(5);
      const hasValidSchema =
        ResponseTeamWithRelationsSchema.array().safeParse(teams).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the teams with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/teams')
          .expect(200);
        const teams = response.body;
        expect(teams).toHaveLength(5);
        const hasValidSchema =
          ResponseTeamWithRelationsSchema.array().safeParse(teams).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered teams with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get(
            '/v1/teams?name=Team+1&with=members,fundingStage,teamMemberRoles'
          )
          .expect(200);
        const teams = response.body;
        expect(teams).toHaveLength(1);
        const hasValidSchema =
          ResponseTeamWithRelationsSchema.array().safeParse(teams).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });

  describe('When getting an team by uid', () => {
    it('should return the team with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/teams/uid-1')
        .expect(200);
      const team = response.body;
      const hasValidSchema =
        ResponseTeamWithRelationsSchema.safeParse(team).success;
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

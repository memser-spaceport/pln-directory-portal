import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { createImage } from '../images/__mocks__/images.mocks';
import { createTechnology } from '../technologies/__mocks__/technologies.mocks';
import { createFundingStage } from '../funding-stages/__mocks__/funding-stages.mocks';
import { createMembershipSource } from '../membership-sources/__mocks__/membership-sources.mocks';
import { createIndustryTags } from '../industry-tags/__mocks__/industry-tags.mocks';
import { createTeam, getUpdateTeamPayload } from './__mocks__/teams.mocks';
import { createMember, createMemberRoles } from '../members/__mocks__/members.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';

jest.mock('../guards/auth.guard');
jest.mock('../guards/user-token-validation.guard');

describe('TeamsService', () => {
  let app: INestApplication;
  let cacheManager: Cache;
  let ResponseTeamWithRelationsSchema;

  beforeAll(() => {
    // Fix to avoid circular dependency issue:
    ({ ResponseTeamWithRelationsSchema } = jest.requireActual(
      'libs/contracts/src/schema/team'
    ));
  });

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createFundingStage({ amount: 1 });
    await createTechnology({ amount: 1 });
    await createMembershipSource({ amount: 1 });
    await createIndustryTags({ amount: 1 });
    await createMemberRoles();
    await createImage({ amount: 1 });
    await createMember({ amount: 1 });
    await createTeam({ amount: 5 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  function mockUserTokenValidation(userEmail) {
    return (UserTokenValidation.prototype.canActivate as jest.Mock).mockImplementation(
      (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        request.userEmail = userEmail;
        return true;
      }
    );
  }

  describe('When getting an member by uid', () => {
    it('should return the member with a valid schema', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/members/uid-1')
        .expect(200);
    });
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
  describe('When trying to update a team detail', () => {
    it('should throw error on insufficient role permission to update team', async () => {
      mockUserTokenValidation('email-1@mail.com');
      const team = await supertest(app.getHttpServer())
        .get('/v1/teams/uid-1');
      const requestPayload = await getUpdateTeamPayload();
      await supertest(app.getHttpServer())
        .put(`/v1/teams/${team.body.uid}`)
        .send(requestPayload)
        .expect(400);
    });
    it('should throw error on non existing member email id in request to update team', async () => {
      mockUserTokenValidation('email-2@mail.com');
      const team = await supertest(app.getHttpServer())
        .get('/v1/teams/uid-1');
      const requestPayload = await getUpdateTeamPayload();
      await supertest(app.getHttpServer())
        .put(`/v1/teams/${team.body.uid}`)
        .send(requestPayload)
        .expect(401);
    });
  });
});

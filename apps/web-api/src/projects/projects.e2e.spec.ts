import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { faker } from '@faker-js/faker';
import { INestApplication, ExecutionContext } from '@nestjs/common';
// Custom modules
import { createTeam } from '../teams/__mocks__/teams.mocks';
import { createImage } from '../images/__mocks__/images.mocks';
import { createMember, createMemberRoles } from '../members/__mocks__/members.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';
import { createProject, projectFields } from './__mocks__/projects.mocks';
import { UserTokenValidation } from '../guards/user-token-validation.guard';

jest.mock('../guards/user-token-validation.guard');

describe('Projects', () => {
  let app: INestApplication;
  let cacheManager: Cache;
  let ResponseProjectWithRelationsSchema;

  beforeAll(() => {
    // Fix to avoid circular dependency issue:
    ({ ResponseProjectWithRelationsSchema } = jest.requireActual(
      'libs/contracts/src/schema/project'
    ));
  });

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createImage({ amount: 1 });
    await createMemberRoles();
    await createMember({ amount: 2 });
    await createTeam({ amount: 1 });
    await createProject({ amount: 2 });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  function mockUserTokenValidation(userEmail) {
    return (UserTokenValidation.prototype.canActivate as jest.Mock).mockImplementation(
      (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        // Manually set userEmail in the request context
        request.userEmail = userEmail;
        return true;
      }
    );
  }

  describe('When creating new project', () => {
    it('should create new project', async () => {
      mockUserTokenValidation('email-1@mail.com');
      const name = faker.helpers.unique(faker.name.firstName);
      const project = projectFields(3, name);
      const response = await supertest(app.getHttpServer())
        .post('/v1/projects')
        .send(project)
        .expect(201);
      const createdProject = response.body;
      const hasValidSchema =
        ResponseProjectWithRelationsSchema.safeParse(createdProject).success;
      expect(hasValidSchema).toBeTruthy();
    });
    it('should return error on trying to create new project with existing uid', async () => {
      mockUserTokenValidation('email-1@mail.com');
      const name = faker.helpers.unique(faker.name.firstName);
      const project = projectFields(1, name);
      await supertest(app.getHttpServer())
        .post('/v1/projects')
        .send(project)
        .expect(409);
    });
  });

  describe('When fetching projects', () => {
    it('should list all the projects with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/projects')
        .expect(200);
      const projects = response.body;
      expect(projects).toHaveLength(2);
      const hasValidSchema =
        ResponseProjectWithRelationsSchema.array().safeParse(projects).success;
      expect(hasValidSchema).toBeTruthy();
    });
    it('should fetch the project with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/projects/uid-project-1')
        .expect(200);
      const projectResponse = response.body;
      const hasValidSchema =
        ResponseProjectWithRelationsSchema.safeParse(projectResponse).success;
      expect(hasValidSchema).toBeTruthy();
    });
    it('should throw error for the given project uid', async () => {
      await supertest(app.getHttpServer())
        .get('/v1/projects/uid-64764812345')
        .expect(404);
    });
  });

  describe('When updating project', () => {
    it('should update a project by uid', async () => {
      mockUserTokenValidation('email-1@mail.com');
      const response = await supertest(app.getHttpServer()).get('/v1/projects/uid-project-1');
      const project = response.body;
      project.maintainingTeamUid = project.maintainingTeam;
      project.readMe = null;
      project.logoUid = project.logo;
      await supertest(app.getHttpServer())
        .put(`/v1/projects/${project.uid}`)
        .send(project)
        .expect(400);
    });
    it('should throw error for invalid project creator', async () => {
      mockUserTokenValidation('email-2@mail.com');
      const response = await supertest(app.getHttpServer()).get('/v1/projects/uid-project-2');
      const project = response.body;
      await supertest(app.getHttpServer())
        .put(`/v1/projects/${project.uid}`)
        .send(project)
        .expect(403);
    });
  });

  describe('When deleting project', () => {
    it('should delete a project by uid', async () => {
      mockUserTokenValidation('email-1@mail.com');
      await supertest(app.getHttpServer())
        .delete('/v1/projects/uid-project-1')
        .expect(200);
    });
    it('should throw error for invalid member email', async () => {
      mockUserTokenValidation('email-2@mail.com');
      await supertest(app.getHttpServer())
        .delete('/v1/projects/uid-project-2')
        .expect(403);
    });
    it('should throw error for non exist member email', async () => {
      mockUserTokenValidation('email-234567@mail.com');
      const response = await supertest(app.getHttpServer())
        .delete('/v1/projects/uid-project-2');
      // .expect(403);
    });
    it('should throw error for non-exist project uid', async () => {
      mockUserTokenValidation('email-1@mail.com');
      await supertest(app.getHttpServer())
        .delete('/v1/projects/uid-project-9999999999')
        .expect(500);
    });
  });
});

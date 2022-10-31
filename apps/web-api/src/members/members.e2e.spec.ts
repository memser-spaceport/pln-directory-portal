import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MemberSchema } from 'libs/contracts/src/schema';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import { MembersModule } from './members.module';
import { createMember } from './__mocks__/members.mocks';

describe('Members', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [MembersModule],
    }).compile();
    app = moduleRef.createNestApplication();
    mainConfig(app);
    await app.init();
    await createMember({ amount: 5 });
  });

  describe('When getting all members', () => {
    it.only('should list all the members with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/members')
        .expect(200);
      const members = response.body;
      expect(members).toHaveLength(5);
      const hasValidSchema = MemberSchema.array().safeParse(members).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting an member by uid', () => {
    it('should return the member with a valid schema', async () => {
      const response = await supertest(app.getHttpServer())
        .get('/v1/members/uid-1')
        .expect(200);
      const member = response.body;
      const hasValidSchema = MemberSchema.safeParse(member).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When getting a member by uid that does not exist', () => {
    it('should return a 404', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/uid-6').expect(404);
    });
  });

  describe('When getting a member with an uid with only numbers', () => {
    it('should return a 400', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/123').expect(404);
    });
  });
});

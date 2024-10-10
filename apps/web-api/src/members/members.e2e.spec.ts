import supertest from 'supertest';
import { Cache } from 'cache-manager';
import { faker } from '@faker-js/faker';
import { INestApplication, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '../guards/auth.guard';
import { EmailOtpService } from '../otp/email-otp.service';
import { MembersService } from './members.service';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { ResponseMemberWithRelationsSchema } from 'libs/contracts/src/schema';
import { createMember, getEditMemberParticipantsRequestPayload, createMemberRoles } from './__mocks__/members.mocks';
import { bootstrapTestingApp } from '../utils/bootstrap-testing-app';
import { z } from 'zod';

jest.mock('../guards/auth.guard');
jest.mock('../otp/email-otp.service');
jest.mock('../guards/user-token-validation.guard');
jest.mock('../guards/user-access-token-validate.guard');

describe('Members', () => {
  let app: INestApplication;
  let cacheManager: Cache;
  let memberschema;

  beforeEach(async () => {
    ({ app, cacheManager } = await bootstrapTestingApp());
    await app.init();
    await cacheManager.reset();
    await createMemberRoles();
    await createMember({ amount: 2 });
    memberschema = ResponseMemberWithRelationsSchema.extend({
      moreDetails: z.string(),
      plnStartDate: z.string(),
      externalId: z.string(),
    });
  });

  afterAll(async () => {
    await app.close();
    await cacheManager.reset();
  });

  function mockAuthGuard(userEmail) {
    return (AuthGuard.prototype.canActivate as jest.Mock).mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest();
      request.userEmail = userEmail;
      return true;
    });
  }

  function mockUserTokenValidation(userEmail) {
    return (UserTokenValidation.prototype.canActivate as jest.Mock).mockImplementation((context: ExecutionContext) => {
      const request = context.switchToHttp().getRequest();
      request.userEmail = userEmail;
      return true;
    });
  }

  function mockVerifyEmailOtp(otp, otpToken, recipient, valid) {
    return (EmailOtpService.prototype.verifyEmailOtp as jest.Mock).mockImplementation((otp, otpToken) => {
      return { recipient, valid };
    });
  }

  function mockUserAccessTokenValidateGuard(userEmail, userUid, userAccessToken) {
    return (UserAccessTokenValidateGuard.prototype.canActivate as jest.Mock).mockImplementation(
      (context: ExecutionContext) => {
        const request = context.switchToHttp().getRequest();
        request.userUid = userUid;
        request.userEmail = userEmail;
        request.userAccessToken = userAccessToken;
        return true;
      }
    );
  }

  describe('When fetching member by email id', () => {
    it('should return the member detail', async () => {
      const memberService = app.get(MembersService);
      const member = await memberService.findMemberByEmail('email-1@mail.com');
      expect(member?.email).toBe('email-1@mail.com');
    });
    it('should throw error on fetching non exist member by email id', async () => {
      const memberService = app.get(MembersService);
      const result = await memberService.findMemberByEmail('email-1763@mail.com');
      expect(result).toBeNull();
    });
  });

  describe('When fetching member from email id', () => {
    it('should return the member detail', async () => {
      const memberService = app.get(MembersService);
      const member = await memberService.findMemberFromEmail('email-1@mail.com');
      expect(member?.email).toBe('email-1@mail.com');
    });
  });

  describe('When fetching member by external id ', () => {
    it('should return the member detail', async () => {
      const memberService = app.get(MembersService);
      const member = await memberService.findMemberByExternalId('external-1');
      expect(member?.email).toBe('email-1@mail.com');
    });
    it('should throw error on non exist member external id', async () => {
      const memberService = app.get(MembersService);
      const result = await memberService.findMemberByEmail('external-1234');
      expect(result).toBeNull();
    });
  });

  describe('When updating member external id by email id', () => {
    it('should return the member detail', async () => {
      const memberService = app.get(MembersService);
      const member = await memberService.updateExternalIdByEmail('email-1@mail.com', 'external-3');
      expect(member?.email).toBe('email-1@mail.com');
    });

    it('should throw error on non exist member external id', async () => {
      const memberService = app.get(MembersService);
      const result = await memberService.findMemberByEmail('external-1234');
      expect(result).toBeNull();
    });
  });

  describe('When getting all members', () => {
    it('should list all the members with a valid schema', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/members').expect(200);
      const members = response.body;
      expect(members).toHaveLength(2);
      const hasValidSchema = ResponseMemberWithRelationsSchema.array().safeParse(members).success;
      expect(hasValidSchema).toBeTruthy();
    });

    describe('and with an invalid query param', () => {
      it('should list all the members with a valid schema', async () => {
        const response = await supertest(app.getHttpServer()).get('/v1/members?invalid=true').expect(200);
        const members = response.body;
        expect(members).toHaveLength(2);
        const hasValidSchema = ResponseMemberWithRelationsSchema.array().safeParse(members).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });

    describe('and with a valid query param', () => {
      it('should list filtered members with a valid schema', async () => {
        const response = await supertest(app.getHttpServer())
          .get('/v1/members?email__endswith=1@mail.com&with=location')
          .expect(200);
        const members = response.body;
        expect(members).toHaveLength(1);
        const hasValidSchema = ResponseMemberWithRelationsSchema.array().safeParse(members).success;
        expect(hasValidSchema).toBeTruthy();
      });
    });
  });

  describe('When getting an member by uid', () => {
    it('should return the member with a valid schema', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/members/uid-1').expect(200);
      const member = response.body;
      const hasValidSchema = ResponseMemberWithRelationsSchema.safeParse(member).success;
      expect(hasValidSchema).toBeTruthy();
    });
  });

  describe('When fetching github projects by member uid', () => {
    it('should get success response for the given member uid', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/members/uid-1123456/git-projects').expect(200);
      expect(response.body).toHaveLength(0);
    });

    it('should throw error on invalid github handler for the given member uid', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/uid-1/git-projects1').expect(404);
    });
  });

  describe('When fetch preferences by member uid', () => {
    mockAuthGuard('email-1@mail.com');
    it('should return the preferences', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/members/uid-1/preferences').expect(200);
      const preferences = response.body;
      expect(preferences).toHaveProperty('email');
      expect(preferences).toHaveProperty('showEmail');
      expect(preferences).toHaveProperty('showGithubHandle');
    });
    it('should throw error for non exist member uid', async () => {
      await supertest(app.getHttpServer()).get('/v1/members/uid-99999999/preferences').expect(500);
    });
  });

  describe('When updating preferences for given member uid', () => {
    mockAuthGuard('email-1@mail.com');
    it('should update the preferences for given member uid', async () => {
      const response = await supertest(app.getHttpServer()).get('/v1/members/uid-1').expect(200);
      const member = response.body;
      const preferences = member.preferences;
      expect(preferences).toHaveProperty('showEmail');
      expect(preferences).toHaveProperty('showTelegram');
      preferences.showTelegram = false;
      await supertest(app.getHttpServer()).patch('/v1/member/uid-1/preferences').send(preferences).expect(200);
    });
  });

  describe('When updating edit member participants', () => {
    it('should throw bad request error for payload validation', async () => {
      mockUserTokenValidation('email-1@mail.com');
      mockVerifyEmailOtp('1234', '234567', 'email-2@mail.com', false);
      const payload = await getEditMemberParticipantsRequestPayload('uid-2', false);
      await supertest(app.getHttpServer()).put('/v1/member/uid-1').send(payload).expect(400);
    });
    it('should throw error for invalid request email id', async () => {
      mockUserTokenValidation('email-3@mail.com');
      mockVerifyEmailOtp('1234', '234567', 'email-3@mail.com', false);
      const payload = getEditMemberParticipantsRequestPayload('uid-1', true);
      await supertest(app.getHttpServer()).put('/v1/member/uid-1').send(payload).expect(401);
    });
    it('should throw forbidden error for invalid referenceUid role', async () => {
      mockUserTokenValidation('email-2@mail.com');
      const payload = getEditMemberParticipantsRequestPayload('uid-1', true);
      await supertest(app.getHttpServer()).put('/v1/member/uid-1').send(payload).expect(403);
    });
  });

  describe('Send OTP for email change', () => {
    it('should throw error for already existing email', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('email-1@mail.com', 'uid-1', token);
      await supertest(app.getHttpServer())
        .post('/v1/members/uid-1/email/otp')
        .send({ newEmail: 'email-2@mail.com' })
        .expect(400);
    });
    it('should throw error for using same email id of request user', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('email-1@mail.com', 'uid-1', token);
      await supertest(app.getHttpServer())
        .post('/v1/members/uid-1/email/otp')
        .send({ newEmail: 'email-1@mail.com' })
        .expect(400);
    });
    it('should send OTP for given email', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('email-1@mail.com', 'uid-1', token);
      await supertest(app.getHttpServer())
        .post('/v1/members/uid-1/email/otp')
        .send({ newEmail: 'email-3@mail.com' })
        .expect(201);
    });
    it('should throw error for non exist email', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('gumotelotoi-5487@yopmail.com', 'uid-1', token);
      await supertest(app.getHttpServer())
        .post('/v1/members/uid-1/email/otp')
        .send({ newEmail: 'email-1@mail.com' })
        .expect(403);
    });
  });

  describe('When updating member email with OTP & token', () => {
    it('should throw error for invalid member email', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('email-1456@mail.com', 'uid-1', token);
      const response = await supertest(app.getHttpServer())
        .patch('/v1/members/uid-id/email')
        .send({
          otpToken: token,
          otp: 123456,
        })
        .expect(403);
    });

    it('should throw error for invalid OTP & token to update the email', async () => {
      const token = 'Bearer kdgalfsdfaDYUAF35432bfdbdbvdgdag';
      mockUserAccessTokenValidateGuard('email-1@mail.com', 'uid-1', token);
      const response = await supertest(app.getHttpServer()).patch('/v1/members/uid-id/email').send({
        otpToken: token,
        otp: 123456,
      });
      expect(response.body.valid).toBeFalsy();
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

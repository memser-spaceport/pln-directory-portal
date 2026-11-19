// The real service and guard load too much for ts-jest (see pl-events.routes.spec.ts), so they are stubbed.
// The controller, the filters and Nest's router are real.
jest.mock('axios', () => ({ __esModule: true, default: { isAxiosError: () => false } }));
jest.mock('../guards/user-token-validation.guard', () => ({
  UserTokenValidation: class {
    canActivate(ctx: { switchToHttp: () => { getRequest: () => { userEmail?: string } } }) {
      ctx.switchToHttp().getRequest().userEmail = 'member@example.com';
      return true;
    }
  },
}));
jest.mock('./labos-agent.service', () => ({ LabosAgentService: class {} }));

import {
  ConflictException,
  ForbiddenException,
  HttpException,
  INestApplication,
  Module,
  NotFoundException,
} from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import request from 'supertest';
import { LABOS_AGENT_ERROR_CODES } from 'libs/contracts/src/schema/labos-agent';
import { LogException } from '../filters/log-exception.filter';
import { LabosAgentController } from './labos-agent.controller';
import { LabosAgentService } from './labos-agent.service';

const chatBody = { threadId: 't1', chatId: 'c1', message: 'Hello' };

/**
 * LAB-3300: the global LogException rebuilt every error body as { statusCode, message } and dropped `code`.
 * These requests go through the real filter chain, with LogException as the global filter as in app.module.ts.
 */
describe('LabOS agent error bodies over HTTP (LAB-3300)', () => {
  let app: INestApplication;
  const agent = { chat: jest.fn(), confirm: jest.fn(), isEnabled: jest.fn(), mentions: jest.fn() };

  beforeAll(async () => {
    // NestFactory, not @nestjs/testing: the installed @nestjs/testing (9.0) does not match @nestjs/core (9.4).
    @Module({
      controllers: [LabosAgentController],
      providers: [
        { provide: LabosAgentService, useValue: agent },
        { provide: APP_FILTER, useClass: LogException },
      ],
    })
    class ErrorsTestModule {}
    app = await NestFactory.create(ErrorsTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('S3-R7: C1 unknown intro target gives 404 with code INTRO_TARGET_NOT_FOUND', async () => {
    const body = {
      statusCode: 404,
      code: LABOS_AGENT_ERROR_CODES.INTRO_TARGET_NOT_FOUND,
      message: 'Intro target not found: member qa-missing-member-0001',
    };
    agent.chat.mockRejectedValue(new NotFoundException(body));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/chat')
      .send({ ...chatBody, context: { page: 'intro', introTarget: { type: 'member', uid: 'qa-missing-member-0001' } } })
      .expect(404);
    expect(res.body).toEqual(body);
  });

  it('S1: C1 unknown news story gives 404 with code NEWS_NOT_FOUND', async () => {
    const body = { statusCode: 404, code: LABOS_AGENT_ERROR_CODES.NEWS_NOT_FOUND, message: 'News item not found: n-1' };
    agent.chat.mockRejectedValue(new NotFoundException(body));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/chat')
      .send({ ...chatBody, context: { page: 'news-story', newsUid: 'n-1' } })
      .expect(404);
    expect(res.body).toEqual(body);
  });

  it('S1: C1 outside the pilot gate gives 403 with code AGENT_NOT_ENABLED', async () => {
    const body = {
      statusCode: 403,
      code: LABOS_AGENT_ERROR_CODES.AGENT_NOT_ENABLED,
      message: 'The LabOS agent is not enabled for this member',
    };
    agent.chat.mockRejectedValue(new ForbiddenException(body));
    const res = await request(app.getHttpServer()).post('/v1/labos-agent/chat').send(chatBody).expect(403);
    expect(res.body).toEqual(body);
  });

  it('S1: C1 bad body gives 400 VALIDATION_ERROR with the errors list', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/chat')
      .send({ ...chatBody, message: '   ' })
      .expect(400);
    expect(res.body).toMatchObject({ statusCode: 400, code: LABOS_AGENT_ERROR_CODES.VALIDATION_ERROR });
    expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ path: 'message' })]));
    expect(agent.chat).not.toHaveBeenCalled();
  });

  it('S2: C2 closed proposal gives 409 PROPOSAL_CLOSED with status', async () => {
    const body = {
      statusCode: 409,
      code: LABOS_AGENT_ERROR_CODES.PROPOSAL_CLOSED,
      message: 'The proposal is closed',
      status: 'done',
    };
    agent.confirm.mockRejectedValue(new ConflictException(body));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/actions/confirm')
      .send({ proposalId: 'ap_1', decision: 'confirm' })
      .expect(409);
    expect(res.body).toEqual(body);
  });

  it('an HttpException with no code keeps the LogException body', async () => {
    agent.confirm.mockRejectedValue(new HttpException({ message: 'Plain error', extra: 'dropped' }, 418));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/actions/confirm')
      .send({ proposalId: 'ap_1', decision: 'confirm' })
      .expect(418);
    expect(res.body).toEqual({ statusCode: 418, message: 'Plain error' });
  });

  it('an error that is not an HttpException still gets the LogException 500 body', async () => {
    agent.confirm.mockRejectedValue(new Error('boom'));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/actions/confirm')
      .send({ proposalId: 'ap_1', decision: 'confirm' })
      .expect(500);
    expect(res.body).toEqual({ statusCode: 500, message: 'Unexpected Error. Please try again.' });
  });

  it('S6-C27: C1 unknown member mention gives 404 MEMBER_NOT_FOUND and keeps mentionIndex', async () => {
    const body = {
      statusCode: 404,
      code: LABOS_AGENT_ERROR_CODES.MEMBER_NOT_FOUND,
      message: 'Member not found: m-x',
      mentionIndex: 1,
    };
    agent.chat.mockRejectedValue(new NotFoundException(body));
    const res = await request(app.getHttpServer())
      .post('/v1/labos-agent/chat')
      .send({
        ...chatBody,
        mentions: [
          { type: 'page', page: 'home' },
          { type: 'member', uid: 'm-x' },
        ],
      })
      .expect(404);
    expect(res.body).toEqual(body);
  });

  it('S6-C5: C4 limit=11 gives 400 VALIDATION_ERROR and the service is not called', async () => {
    const res = await request(app.getHttpServer()).get('/v1/labos-agent/mentions?q=ada&limit=11').expect(400);
    expect(res.body).toEqual(
      expect.objectContaining({ statusCode: 400, code: LABOS_AGENT_ERROR_CODES.VALIDATION_ERROR })
    );
    expect(agent.mentions).not.toHaveBeenCalled();
  });

  it('S6-C6: C4 returns the four keys over HTTP', async () => {
    const response = { q: 'ada', members: [], teams: [], news: [] };
    agent.mentions.mockResolvedValue(response);
    const res = await request(app.getHttpServer()).get('/v1/labos-agent/mentions?q=ada&types=news').expect(200);
    expect(res.body).toEqual(response);
    expect(agent.mentions).toHaveBeenCalledWith('member@example.com', { q: 'ada', types: ['news'], limit: 5 });
  });
});

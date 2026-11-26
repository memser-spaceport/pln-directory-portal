jest.mock('axios', () => ({ post: jest.fn() }));
jest.mock('./husky.service', () => ({ HuskyService: class {} }));
jest.mock('./husky-ai.service', () => ({ HuskyAiService: class {} }));

import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import axios from 'axios';
import { HuskyThreadsController } from './husky-threads.controller';
import { HuskyService } from './husky.service';
import { HuskyAiService } from './husky-ai.service';

const huskyAi = {
  duplicateThread: jest.fn(async (threadId: string, email?: string, guestUserId?: string) => ({
    threadId: 'copy-1',
    createdFrom: threadId,
    email: email ?? null,
    guestUserId: guestUserId ?? null,
  })),
};

describe('POST /v1/husky/threads/:threadId', () => {
  let app: INestApplication;

  beforeAll(async () => {
    @Module({
      controllers: [HuskyThreadsController],
      providers: [
        { provide: HuskyService, useValue: {} },
        { provide: HuskyAiService, useValue: huskyAi },
      ],
    })
    class DuplicateThreadTestModule {}

    app = await NestFactory.create(DuplicateThreadTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  it('duplicates as a guest when the request has no token', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/husky/threads/thread-1')
      .send({ guestUserId: 'guest-1' })
      .expect(201);

    expect(response.body).toMatchObject({ email: null, guestUserId: 'guest-1' });
    expect(huskyAi.duplicateThread).toHaveBeenCalledWith('thread-1', undefined, 'guest-1');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('returns 401 when the token is invalid', async () => {
    (axios.post as jest.Mock).mockResolvedValue({ data: { active: false } });

    await request(app.getHttpServer())
      .post('/v1/husky/threads/thread-1')
      .set('Authorization', 'Bearer stale')
      .send({ guestUserId: 'guest-1' })
      .expect(401);

    expect(huskyAi.duplicateThread).not.toHaveBeenCalled();
  });

  it('duplicates as the member when the token is valid', async () => {
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true, email: 'ada@example.com', sub: 'ada' },
    });

    const response = await request(app.getHttpServer())
      .post('/v1/husky/threads/thread-1')
      .set('Authorization', 'Bearer ada-token')
      .send({})
      .expect(201);

    expect(response.body).toMatchObject({ email: 'ada@example.com', guestUserId: null });
    expect(huskyAi.duplicateThread).toHaveBeenCalledWith('thread-1', 'ada@example.com', undefined);
  });
});

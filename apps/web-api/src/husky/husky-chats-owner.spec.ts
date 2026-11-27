// The same module graph mocks as husky-ai.service.spec.ts: these packages ship ESM this jest config can't parse.
jest.mock('@ai-sdk/openai', () => ({
  openai: Object.assign(jest.fn(), { responses: jest.fn(), tools: { webSearchPreview: jest.fn(() => ({})) } }),
}));
jest.mock('@ai-sdk/google', () => ({ google: jest.fn() }));
jest.mock('@ai-sdk/anthropic', () => ({ anthropic: jest.fn(), createAnthropic: jest.fn() }));
jest.mock('ai', () => ({ streamText: jest.fn(), streamObject: jest.fn(), generateText: jest.fn() }));
jest.mock('./tools/husky-ai-tools.serivice', () => ({ HuskyAiToolsService: jest.fn() }));
jest.mock('./husky.service', () => ({ HuskyService: class {} }));
jest.mock('axios', () => ({ post: jest.fn() }));

import { INestApplication, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import axios from 'axios';
import { streamText } from 'ai';
import { HuskyChatsController } from './husky-chats.controller';
import { HuskyService } from './husky.service';
import { HuskyAiService } from './husky-ai.service';

/** LAB-3459: the route answers a refused write with a plain 403, before any stream starts. */
describe('POST /v1/husky/chat/contextual-tools on a thread of another member', () => {
  const persistent = {
    findOneByKeyValue: jest.fn(),
    getDocByKeyValue: jest.fn(),
    create: jest.fn(),
    updateDocByKeyValue: jest.fn(),
    upsertByKeyValue: jest.fn(),
  };
  const cache = { get: jest.fn(), set: jest.fn() };
  let app: INestApplication;

  beforeAll(async () => {
    const service = new HuskyAiService(
      { error: jest.fn(), info: jest.fn() } as any,
      cache as any,
      persistent as any,
      { member: { findUnique: jest.fn() } } as any,
      { getTools: jest.fn() } as any,
      { getResponsesModel: jest.fn() } as any
    );
    @Module({
      controllers: [HuskyChatsController],
      providers: [
        { provide: HuskyService, useValue: {} },
        { provide: HuskyAiService, useValue: service },
      ],
    })
    class ContextualToolsOwnerTestModule {}

    app = await NestFactory.create(ContextualToolsOwnerTestModule, { logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    persistent.findOneByKeyValue.mockResolvedValue({ threadId: 'thread-1', email: 'owner@example.com' });
    (axios.post as jest.Mock).mockResolvedValue({ data: { active: true, email: 'other@example.com', sub: 'other' } });
  });

  it('returns 403 with a clear message and writes nothing', async () => {
    const response = await request(app.getHttpServer())
      .post('/v1/husky/chat/contextual-tools')
      .set('Authorization', 'Bearer other-token')
      .send({ question: 'Add this to their thread', threadId: 'thread-1', chatId: 'chat-1' })
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      message: 'You are not authorized to add to this thread. Start a new thread or duplicate this one.',
    });
    expect(response.headers['transfer-encoding']).toBeUndefined();
    expect(streamText).not.toHaveBeenCalled();
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(persistent.create).not.toHaveBeenCalled();
    expect(persistent.updateDocByKeyValue).not.toHaveBeenCalled();
    expect(persistent.upsertByKeyValue).not.toHaveBeenCalled();
  });
});

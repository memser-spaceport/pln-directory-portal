import { Body, Controller, Get, MiddlewareConsumer, Module, NestModule, Post, RequestMethod } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { request } from 'http';
import { AddressInfo } from 'net';
import { AiAppSessionScopeMiddleware } from './ai-app-session-scope.middleware';

/** Same controller prefix and routes as AiAppsController, plus a route the token must not reach. */
@Controller('v1/ai-apps')
class FakeAiAppsController {
  @Get('me') me() {
    return { ok: 'me' };
  }
  @Post('track') track(@Body() _b: unknown) {
    return { ok: 'track' };
  }
  @Get('access-check') accessCheck() {
    return { ok: 'access-check' };
  }
  @Get(':uid') app() {
    return { ok: 'app' };
  }
}

@Controller('v1/members')
class FakeMembersController {
  @Get(':uid') member() {
    return { ok: 'member' };
  }
}

/** Mirrors the AiAppSessionScopeMiddleware registration in app.module.ts. */
@Module({ controllers: [FakeAiAppsController, FakeMembersController] })
class ScopeTestModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AiAppSessionScopeMiddleware)
      .exclude(
        { path: 'v1/ai-apps/me', method: RequestMethod.GET },
        { path: 'v1/ai-apps/track', method: RequestMethod.POST },
        { path: 'v1/ai-apps/access-check', method: RequestMethod.GET }
      )
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}

describe('AiAppSessionScopeMiddleware routing (as registered in app.module)', () => {
  const token = jwt.sign({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'm-1' }, 'k');
  let app: any;
  let base: string;

  beforeAll(async () => {
    app = await NestFactory.create(ScopeTestModule, { logger: false });
    await app.listen(0);
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  });
  afterAll(async () => app?.close());

  const call = (method: string, path: string) =>
    new Promise<number>((resolve, reject) => {
      const req = request(
        `${base}${path}`,
        { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        }
      );
      req.on('error', reject);
      req.end(method === 'POST' ? '{}' : undefined);
    });

  it.each([
    ['GET', '/v1/ai-apps/me'],
    ['POST', '/v1/ai-apps/track'],
    ['GET', '/v1/ai-apps/access-check?appId=foo&method=GET'],
  ])('lets an app session token reach %s %s', async (method, path) => {
    expect(await call(method, path)).not.toBe(401);
  });

  it.each([
    ['GET', '/v1/ai-apps/cm123'],
    ['GET', '/v1/members/m-2'],
    ['POST', '/v1/ai-apps/me'],
  ])('401s an app session token on %s %s', async (method, path) => {
    expect(await call(method, path)).toBe(401);
  });
});

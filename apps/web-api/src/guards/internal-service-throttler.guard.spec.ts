import { Controller, Get, INestApplication, Module, Post } from '@nestjs/common';
import { APP_GUARD, NestFactory } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import supertest from 'supertest';
import { mainConfig } from '../main.config';
import {
  FRONTEND_RENDER_HEADER,
  InternalServiceThrottlerGuard,
  isFrontendRenderRead,
} from './internal-service-throttler.guard';

const TOKEN = 'render-token-for-tests';
const LIMIT = 2;

@Controller()
class ProbeController {
  @Get('v1/probe')
  read() {
    return { ok: true };
  }

  @Post('v1/probe')
  write() {
    return { ok: true };
  }
}

@Module({
  imports: [ThrottlerModule.forRoot({ ttl: 60, limit: LIMIT })],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: InternalServiceThrottlerGuard }],
})
class ProbeModule {}

/** LAB-3086: the app-wide limit, as `main.config` and the guard apply it, with a limit of 2 per client per minute. */
describe('InternalServiceThrottlerGuard', () => {
  let app: INestApplication;
  const originalToken = process.env.FRONTEND_RENDER_THROTTLE_TOKEN;
  const originalHops = process.env.TRUST_PROXY_HOPS;

  beforeEach(async () => {
    process.env.FRONTEND_RENDER_THROTTLE_TOKEN = TOKEN;
    delete process.env.TRUST_PROXY_HOPS;
    // NestFactory rather than @nestjs/testing, whose installed 9.0 does not match @nestjs/core 9.4.
    app = await NestFactory.create(ProbeModule, { logger: false });
    mainConfig(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    process.env.FRONTEND_RENDER_THROTTLE_TOKEN = originalToken;
    process.env.TRUST_PROXY_HOPS = originalHops;
    if (originalToken === undefined) delete process.env.FRONTEND_RENDER_THROTTLE_TOKEN;
    if (originalHops === undefined) delete process.env.TRUST_PROXY_HOPS;
  });

  /** A request as the ALB forwards it: the address that connected to it is the last `X-Forwarded-For` entry. */
  const fromClient = (client: string, spoofed?: string) =>
    supertest(app.getHttpServer())
      .get('/v1/probe')
      .set('X-Forwarded-For', spoofed ? `${spoofed}, ${client}` : client);

  it('still throttles a burst from one client', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await fromClient('203.0.113.1').expect(200);
    }
    await fromClient('203.0.113.1').expect(429);
  });

  it('gives each client behind the load balancer a budget of its own', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await fromClient('203.0.113.1').expect(200);
    }
    await fromClient('203.0.113.1').expect(429);
    await fromClient('203.0.113.2').expect(200);
  });

  it('does not let a client escape the limit by writing its own X-Forwarded-For entries', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await fromClient('203.0.113.1', `198.51.100.${i}`).expect(200);
    }
    await fromClient('203.0.113.1', '198.51.100.99').expect(429);
  });

  it("lets the frontend server's reads through with the render token", async () => {
    for (let i = 0; i < LIMIT * 5; i++) {
      await fromClient('203.0.113.1').set(FRONTEND_RENDER_HEADER, TOKEN).expect(200);
    }
  });

  it('throttles a wrong token like no token', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await fromClient('203.0.113.1').set(FRONTEND_RENDER_HEADER, 'wrong').expect(200);
    }
    await fromClient('203.0.113.1').set(FRONTEND_RENDER_HEADER, 'wrong').expect(429);
  });

  it('keeps the limit on writes, even with the render token', async () => {
    const write = () =>
      supertest(app.getHttpServer())
        .post('/v1/probe')
        .set('X-Forwarded-For', '203.0.113.1')
        .set(FRONTEND_RENDER_HEADER, TOKEN);
    for (let i = 0; i < LIMIT; i++) {
      await write().expect(201);
    }
    await write().expect(429);
  });
});

describe('isFrontendRenderRead', () => {
  const get = (token?: string | string[]) => ({ method: 'GET', headers: { [FRONTEND_RENDER_HEADER]: token } });

  it('exempts nothing when no token is configured', () => {
    expect(isFrontendRenderRead(get(''), undefined)).toBe(false);
    expect(isFrontendRenderRead(get(''), '')).toBe(false);
  });

  it('accepts the configured token on GET and HEAD only', () => {
    expect(isFrontendRenderRead(get(TOKEN), TOKEN)).toBe(true);
    expect(isFrontendRenderRead({ ...get(TOKEN), method: 'HEAD' }, TOKEN)).toBe(true);
    expect(isFrontendRenderRead({ ...get(TOKEN), method: 'DELETE' }, TOKEN)).toBe(false);
  });

  it('rejects a missing, shorter or longer token', () => {
    expect(isFrontendRenderRead(get(undefined), TOKEN)).toBe(false);
    expect(isFrontendRenderRead(get(TOKEN.slice(1)), TOKEN)).toBe(false);
    expect(isFrontendRenderRead(get(`${TOKEN}x`), TOKEN)).toBe(false);
    expect(isFrontendRenderRead(get([TOKEN]), TOKEN)).toBe(true);
  });
});

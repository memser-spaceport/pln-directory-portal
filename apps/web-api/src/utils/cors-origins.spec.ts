import 'reflect-metadata';
import cors from 'cors';
import { mainConfig } from '../main.config';
import { NotificationGateway } from '../websocket/websocket.gateway';
import { ALLOWED_CORS_ORIGINS, APP_ENV, buildCorsOptions } from './constants';

jest.mock('axios', () => ({ default: { get: jest.fn() } }));

type HeaderMap = Record<string, string>;

function applyCors(env: APP_ENV, method: string, origin?: string) {
  return new Promise<{ statusCode: number; headers: HeaderMap; proceeded: boolean }>((resolve, reject) => {
    const headers: HeaderMap = {};
    let settled = false;
    const finish = (statusCode: number, proceeded: boolean) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, headers, proceeded });
    };
    const req = { method, headers: origin === undefined ? {} : { origin } };
    const res = {
      statusCode: 0,
      setHeader(name: string, value: string) {
        headers[name.toLowerCase()] = String(value);
      },
      getHeader(name: string) {
        return headers[name.toLowerCase()];
      },
      end() {
        finish(this.statusCode, false);
      },
    };
    cors(buildCorsOptions(env))(req as any, res as any, (err?: Error) => {
      if (err) {
        reject(err);
        return;
      }
      finish(res.statusCode, true);
    });
  });
}

describe('CORS origins', () => {
  it('anchors every pattern to the full origin', () => {
    for (const list of Object.values(ALLOWED_CORS_ORIGINS)) {
      for (const entry of list) {
        if (entry instanceof RegExp) {
          expect(entry.source.startsWith('^')).toBe(true);
          expect(entry.source.endsWith('$')).toBe(true);
          expect(entry.flags).toBe('');
        } else {
          expect(entry).toMatch(/^https:\/\/[a-z0-9.-]+$/);
        }
      }
    }
  });

  it.each([
    [APP_ENV.DEV, 'http://localhost'],
    [APP_ENV.DEV, 'http://localhost:4200'],
    [APP_ENV.DEV, 'https://directoryv2.dev.os.pl.xyz'],
    [APP_ENV.DEV, 'https://dev-admin.os.pl.xyz'],
    [APP_ENV.DEV, 'https://pr-12.preview.dev.os.pl.xyz'],
    [APP_ENV.DEV, 'https://os.pl.xyz'],
    [APP_ENV.DEV, 'https://dev.plnetwork.io'],
    [APP_ENV.DEV, 'https://foo.dev.plnetwork.io'],
    [APP_ENV.DEV, 'https://preview-name.vercel.app'],
    [APP_ENV.DEV, 'https://directory-fe-pr-123.plnetwork.io'],
    [APP_ENV.DEV, 'https://dev-admin.plnetwork.io'],
    [APP_ENV.STAGING, 'https://staging.plnetwork.io'],
    [APP_ENV.STAGING, 'https://web-protocol-labs-spaceport.vercel.app'],
    [APP_ENV.UAT, 'https://uat.plnetwork.io'],
    [APP_ENV.UAT, 'https://uat-admin.plnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://www.plnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://plnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://admin.plnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://foo.bar.plnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://os.pl.xyz'],
    [APP_ENV.PRODUCTION, 'https://directory.os.pl.xyz'],
    [APP_ENV.PRODUCTION, 'https://protocol.ai'],
    [APP_ENV.PRODUCTION, 'https://www.protocol.ai'],
    [APP_ENV.PRODUCTION, 'https://app.forestadmin.com'],
  ])('allows %s origin %s with credentials', async (env, origin) => {
    const response = await applyCors(env, 'GET', origin);
    expect(response.proceeded).toBe(true);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it.each([
    [APP_ENV.PRODUCTION, 'https://evil-plnetwork.io.example.com'],
    [APP_ENV.PRODUCTION, 'https://plnetwork.io.evil.example'],
    [APP_ENV.PRODUCTION, 'https://notplnetwork.io'],
    [APP_ENV.PRODUCTION, 'https://www.plnetwork.io.evil.example'],
    [APP_ENV.PRODUCTION, 'https://protocol.ai.evil.example'],
    [APP_ENV.PRODUCTION, 'https://notprotocol.ai'],
    [APP_ENV.PRODUCTION, 'https://app.forestadmin.com.evil.example'],
    [APP_ENV.PRODUCTION, 'https://evil.app.forestadmin.com'],
    [APP_ENV.PRODUCTION, 'https://os.pl.xyz.evil.example'],
    [APP_ENV.PRODUCTION, 'https://notos.pl.xyz'],
    [APP_ENV.PRODUCTION, 'http://www.plnetwork.io'],
    [APP_ENV.PRODUCTION, 'http://localhost:3000'],
    [APP_ENV.PRODUCTION, 'https://preview-name.vercel.app'],
    [APP_ENV.DEV, 'https://dev.plnetwork.io.evil.example'],
    [APP_ENV.DEV, 'https://notdev.plnetwork.io'],
    [APP_ENV.DEV, 'https://localhost.evil.example'],
    [APP_ENV.DEV, 'http://localhost.evil.com'],
    [APP_ENV.DEV, 'https://localhost:4200'],
    [APP_ENV.DEV, 'https://evil.vercel.app.example.com'],
    [APP_ENV.DEV, 'https://os.pl.xyz.evil.example'],
    [APP_ENV.DEV, 'https://random.plnetwork.io'],
    [APP_ENV.STAGING, 'https://staging.plnetwork.io.evil.example'],
    [APP_ENV.STAGING, 'https://notstaging.plnetwork.io'],
    [APP_ENV.STAGING, 'https://foo.staging.plnetwork.io'],
    [APP_ENV.STAGING, 'https://preview-name.vercel.app'],
    [APP_ENV.STAGING, 'https://os.pl.xyz'],
    [APP_ENV.UAT, 'https://uat.plnetwork.io.evil.example'],
    [APP_ENV.UAT, 'https://extra.uat.plnetwork.io'],
    [APP_ENV.UAT, 'https://notuat.plnetwork.io'],
  ])('rejects %s origin %s', async (env, origin) => {
    const response = await applyCors(env, 'OPTIONS', origin);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.statusCode).toBe(204);
  });

  it('lets a request with no Origin header proceed', async () => {
    const response = await applyCors(APP_ENV.PRODUCTION, 'GET');
    expect(response.proceeded).toBe(true);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('gives the HTTP API and the notifications socket the same CORS options', () => {
    const app = {
      enableVersioning: jest.fn(),
      useGlobalFilters: jest.fn(),
      use: jest.fn(),
      enableCors: jest.fn(),
    };
    mainConfig(app as any);
    const httpCors = app.enableCors.mock.calls[0][0];
    const socketCors = Reflect.getMetadata('websockets:gateway_options', NotificationGateway).cors;
    expect(httpCors).toEqual(buildCorsOptions());
    expect(socketCors.origin).toBe(httpCors.origin);
    expect(socketCors.credentials).toBe(true);
  });
});

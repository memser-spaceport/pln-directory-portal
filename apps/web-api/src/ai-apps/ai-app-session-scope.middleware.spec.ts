import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AiAppSessionScopeMiddleware, appIdFromOrigin } from './ai-app-session-scope.middleware';
import { buildAppUrl } from './ai-apps.constants';

const appToken = jwt.sign({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'm-1' }, 'k');
const labosToken = jwt.sign({ iss: 'https://auth.os.pl.xyz', sub: 's-1' }, 'k');

function run(authorization?: string, url = '/v1/members/m-2', origin?: string) {
  const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
  const next = jest.fn();
  const headers: any = { ...(authorization ? { authorization } : {}), ...(origin ? { origin } : {}) };
  const req: any = { method: 'PUT', originalUrl: `${url}?x=1`, headers, cookies: {} };
  new AiAppSessionScopeMiddleware().use(req, res, next);
  return { res, next };
}

describe('AiAppSessionScopeMiddleware', () => {
  afterEach(() => jest.restoreAllMocks());

  it('401s an app session token on any other route and logs the app and route', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { res, next } = run(`Bearer ${appToken}`);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: 'ai_app_session_disallowed_route',
      appId: 'foo',
      route: 'PUT /v1/members/m-2',
    });
  });

  it.each([
    ['a LabOS token', `Bearer ${labosToken}`],
    ['no token', undefined],
    ['a non-JWT bearer', 'Bearer abc'],
  ])('passes %s through untouched', (_label, authorization) => {
    const { res, next } = run(authorization);
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('logs (but does not block) a LabOS token sent from a deployed app origin', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { res, next } = run(`Bearer ${labosToken}`, '/v1/members/m-2', buildAppUrl('network-pulse', 'prod'));

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: 'ai_app_origin_labos_token',
      appId: 'network-pulse',
      route: 'PUT /v1/members/m-2',
    });
  });

  it('does not log LabOS itself or other platform hosts under the app domain', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    run(`Bearer ${labosToken}`, '/v1/members/m-2', buildAppUrl('directoryv2', 'prod'));
    run(`Bearer ${labosToken}`, '/v1/members/m-2', 'https://example.com');
    expect(warn).not.toHaveBeenCalled();
  });

  it('maps app origins to appIds', () => {
    expect(appIdFromOrigin(buildAppUrl('foo', 'prod'))).toBe('foo');
    expect(appIdFromOrigin(buildAppUrl('foo', 'preview'))).toBe('foo-preview');
    expect(appIdFromOrigin(buildAppUrl('forum', 'prod'))).toBeNull();
    expect(appIdFromOrigin('not a url')).toBeNull();
  });
});

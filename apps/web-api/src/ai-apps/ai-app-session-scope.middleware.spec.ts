import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { AiAppSessionScopeMiddleware, appIdFromOrigin } from './ai-app-session-scope.middleware';
import { buildAppUrl } from './ai-apps.constants';

const appToken = jwt.sign({ iss: 'pln-ai-apps-session', aud: 'foo', uid: 'm-1' }, 'k');
const labosToken = jwt.sign({ iss: 'https://auth.os.pl.xyz', sub: 's-1' }, 'k');

function run(authorization?: string, url = '/v1/members/m-2', origin?: string, cookies: Record<string, string> = {}) {
  const res: any = { status: jest.fn().mockReturnThis(), send: jest.fn().mockReturnThis() };
  const next = jest.fn();
  const headers: any = { ...(authorization ? { authorization } : {}), ...(origin ? { origin } : {}) };
  const req: any = { method: 'PUT', originalUrl: `${url}?x=1`, headers, cookies };
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

  it.each<[string, string | undefined, Record<string, string>]>([
    ['Bearer', `Bearer ${labosToken}`, {}],
    ['authToken cookie', undefined, { authToken: `"${labosToken}"` }],
  ])('401s a LabOS member token sent as %s from a deployed app origin', (_label, authorization, cookies) => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { res, next } = run(authorization, '/v1/members/m-2', buildAppUrl('network-pulse', 'prod'), cookies);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({
      statusCode: 401,
      message: 'LabOS member tokens are not accepted from an AI app origin',
    });
    expect(next).not.toHaveBeenCalled();
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: 'ai_app_origin_labos_token',
      appId: 'network-pulse',
      route: 'PUT /v1/members/m-2',
    });
  });

  it('does not block an app origin that sends no token', () => {
    const { res, next } = run(undefined, '/v1/members/m-2', buildAppUrl('network-pulse', 'prod'));
    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('does not log or block LabOS itself or other platform hosts under the app domain', () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    for (const origin of [buildAppUrl('directoryv2', 'prod'), 'https://example.com']) {
      const bearer = run(`Bearer ${labosToken}`, '/v1/members/m-2', origin);
      const cookie = run(undefined, '/v1/members/m-2', origin, { authToken: `"${labosToken}"` });
      expect(bearer.next).toHaveBeenCalled();
      expect(bearer.res.status).not.toHaveBeenCalled();
      expect(cookie.next).toHaveBeenCalled();
      expect(cookie.res.status).not.toHaveBeenCalled();
    }
    expect(warn).not.toHaveBeenCalled();
  });

  it('maps app origins to appIds', () => {
    expect(appIdFromOrigin(buildAppUrl('foo', 'prod'))).toBe('foo');
    expect(appIdFromOrigin(buildAppUrl('foo', 'preview'))).toBe('foo-preview');
    expect(appIdFromOrigin(buildAppUrl('forum', 'prod'))).toBeNull();
    expect(appIdFromOrigin('not a url')).toBeNull();
  });
});

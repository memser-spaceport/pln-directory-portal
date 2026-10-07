jest.mock('axios', () => ({ post: jest.fn(), isAxiosError: jest.fn(() => false) }));
jest.mock('../ai-apps-testing-users.service', () => ({ AiAppsTestingUsersService: jest.fn() }));

import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import * as jwt from 'jsonwebtoken';
import { AiAppMemberContextGuard } from './ai-app-member-context.guard';
import { buildAppUrl } from '../ai-apps.constants';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const appToken = (appId: string) => jwt.sign({ iss: 'pln-ai-apps-session', aud: appId, uid: 'm-1' }, 'k');
const context = (req: any) => ({ switchToHttp: () => ({ getRequest: () => req }) } as any);

function build(live = true) {
  const sessionService = {
    authenticateAppRequest: jest.fn(async (_token: string, origin?: string): Promise<any> => {
      const ok = live && (!origin || origin === buildAppUrl('foo', 'prod') || origin === buildAppUrl('foo', 'preview'));
      return ok ? { memberUid: 'm-1', appId: 'foo' } : null;
    }),
  };
  const testingUsersService = {
    findLiveForAppId: jest.fn(
      async (): Promise<{ uid: string; name: string } | null> => ({
        uid: 'tu-1',
        name: 'Testing user 1',
      })
    ),
  };
  return {
    guard: new AiAppMemberContextGuard(sessionService as any, testingUsersService as any),
    sessionService,
    testingUsersService,
  };
}

describe('AiAppMemberContextGuard', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['prod origin', buildAppUrl('foo', 'prod')],
    ['preview target origin', buildAppUrl('foo', 'preview')],
    ['no origin (server call)', undefined],
  ])('accepts a live app session from the %s and sets memberUid for RBAC', async (_label, origin) => {
    const { guard } = build();
    const req: any = {
      headers: { authorization: `Bearer ${appToken('foo')}`, ...(origin ? { origin } : {}) },
      cookies: {},
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.memberUid).toBe('m-1');
    expect(req.aiAppAgent).toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('marks an agent session so member context can expose the flag', async () => {
    const { guard, sessionService } = build();
    sessionService.authenticateAppRequest.mockResolvedValue({ memberUid: 'm-1', appId: 'foo', isAgent: true });
    const req: any = { headers: { authorization: `Bearer ${appToken('foo')}` }, cookies: {} };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.memberUid).toBe('m-1');
    expect(req.aiAppAgent).toBe(true);
    expect(req.aiAppTestingUser).toBeUndefined();
  });

  it('401s an app session presented from another app’s origin', async () => {
    const { guard } = build();
    const req = {
      headers: { authorization: `Bearer ${appToken('foo')}`, origin: buildAppUrl('bar', 'prod') },
      cookies: {},
    };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401s an expired or revoked app session without asking the auth service', async () => {
    const { guard } = build(false);
    const req = { headers: { authorization: `Bearer ${appToken('foo')}` }, cookies: {} };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('marks a testing session from the preview origin and skips a member lookup', async () => {
    const { guard, sessionService, testingUsersService } = build();
    sessionService.authenticateAppRequest.mockResolvedValue({
      memberUid: 'tu-1',
      appId: 'foo',
      testing: true,
    });
    const req: any = {
      headers: { authorization: `Bearer ${appToken('foo')}`, origin: buildAppUrl('foo', 'preview') },
      cookies: {},
    };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.aiAppTestingUser).toEqual({ uid: 'tu-1', name: 'Testing user 1' });
    expect(req.memberUid).toBe('tu-1');
    expect(testingUsersService.findLiveForAppId).toHaveBeenCalledWith('tu-1', 'foo');
  });

  it('403s a testing session presented from the production origin', async () => {
    const { guard, sessionService } = build();
    sessionService.authenticateAppRequest.mockResolvedValue({ memberUid: 'tu-1', appId: 'foo', testing: true });
    const req = {
      headers: { authorization: `Bearer ${appToken('foo')}`, origin: buildAppUrl('foo', 'prod') },
      cookies: {},
    };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('401s a testing session whose user is no longer live', async () => {
    const { guard, sessionService, testingUsersService } = build();
    sessionService.authenticateAppRequest.mockResolvedValue({ memberUid: 'tu-1', appId: 'foo', testing: true });
    testingUsersService.findLiveForAppId.mockResolvedValue(null);
    const req = { headers: { authorization: `Bearer ${appToken('foo')}` }, cookies: {} };
    await expect(guard.canActivate(context(req))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('validates a LabOS token exactly as before (auth-service introspection)', async () => {
    const { guard, sessionService } = build();
    mockedAxios.post.mockResolvedValue({ data: { active: true, email: 'ada@example.com', sub: 's-1' } });
    const req: any = { headers: { authorization: 'Bearer labos.jwt.token' }, cookies: {} };
    await expect(guard.canActivate(context(req))).resolves.toBe(true);
    expect(req.userEmail).toBe('ada@example.com');
    expect(sessionService.authenticateAppRequest).not.toHaveBeenCalled();
  });
});

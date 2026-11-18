import { HttpException, UnauthorizedException } from '@nestjs/common';

jest.mock('axios', () => ({ post: jest.fn() }));

import axios from 'axios';
import {
  OptionalUserTokenCheckGuard,
  StrictOptionalUserTokenCheckGuard,
  UserTokenCheckGuard,
} from './user-token-check.guard';

const mockedAxios = axios as jest.Mocked<typeof axios>;
const contextWith = (request: any): any => ({ switchToHttp: () => ({ getRequest: () => request }) });
const expiredError = { response: { status: 401, data: { message: 'Token expired' } } };
const activeToken = { data: { active: true, email: 'a@example.com', sub: 'uid-1' } };

beforeEach(() => jest.clearAllMocks());

describe('UserTokenCheckGuard', () => {
  const guard = new UserTokenCheckGuard();

  it('rejects a request with no token and does not call the auth service', async () => {
    await expect(guard.canActivate(contextWith({ headers: {} }))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: false } });
    await expect(
      guard.canActivate(contextWith({ headers: { authorization: 'Bearer stale' } }))
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an expired token', async () => {
    mockedAxios.post.mockRejectedValue(expiredError);
    const attempt = guard.canActivate(contextWith({ headers: { authorization: 'Bearer expired' } }));
    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((error: HttpException) => expect(error.getStatus()).toBe(401));
  });

  it('accepts a valid token and sets the member identity', async () => {
    mockedAxios.post.mockResolvedValue(activeToken);
    const request: any = { headers: { authorization: 'Bearer good' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request).toMatchObject({ userEmail: 'a@example.com', userUid: 'uid-1', userAccessToken: 'good' });
  });
});

describe('OptionalUserTokenCheckGuard', () => {
  const guard = new OptionalUserTokenCheckGuard();

  it('lets a request with no token through without an identity', async () => {
    const request: any = { headers: {} };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.userEmail).toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('lets an invalid token through as anonymous', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: false } });
    const request: any = { headers: { authorization: 'Bearer stale' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.userEmail).toBeUndefined();
  });

  it('lets an expired token through as anonymous', async () => {
    mockedAxios.post.mockRejectedValue(expiredError);
    const request: any = { headers: { authorization: 'Bearer expired' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.userEmail).toBeUndefined();
  });

  it('accepts a valid token and sets the member identity', async () => {
    mockedAxios.post.mockResolvedValue(activeToken);
    const request: any = { headers: { authorization: 'Bearer good' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request).toMatchObject({ userEmail: 'a@example.com', userUid: 'uid-1', userAccessToken: 'good' });
  });
});

describe('StrictOptionalUserTokenCheckGuard', () => {
  const guard = new StrictOptionalUserTokenCheckGuard();

  it('lets a request with no token through without an identity', async () => {
    const request: any = { headers: {} };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request.userEmail).toBeUndefined();
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: false } });
    const request: any = { headers: { authorization: 'Bearer stale' } };
    await expect(guard.canActivate(contextWith(request))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(request.userEmail).toBeUndefined();
  });

  it('rejects an expired token', async () => {
    mockedAxios.post.mockRejectedValue(expiredError);
    const request: any = { headers: { authorization: 'Bearer expired' } };
    const attempt = guard.canActivate(contextWith(request));
    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((error: HttpException) => expect(error.getStatus()).toBe(401));
    expect(request.userEmail).toBeUndefined();
  });

  it('accepts a valid token and sets the member identity', async () => {
    mockedAxios.post.mockResolvedValue(activeToken);
    const request: any = { headers: { authorization: 'Bearer good' } };
    await expect(guard.canActivate(contextWith(request))).resolves.toBe(true);
    expect(request).toMatchObject({ userEmail: 'a@example.com', userUid: 'uid-1', userAccessToken: 'good' });
  });
});

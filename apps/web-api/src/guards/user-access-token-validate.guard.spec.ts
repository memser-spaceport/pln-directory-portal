import { HttpException, UnauthorizedException } from '@nestjs/common';

jest.mock('axios', () => ({ post: jest.fn() }));

import axios from 'axios';
import { UserAccessTokenValidateGuard, validateUserAccessToken } from './user-access-token-validate.guard';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const requestWith = (authorization?: string): any => ({ headers: authorization ? { authorization } : {}, cookies: {} });

beforeEach(() => jest.clearAllMocks());

describe('validateUserAccessToken', () => {
  it('401s without a token and never calls the auth service', async () => {
    await expect(validateUserAccessToken(requestWith())).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('401s for an inactive token', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: false } });
    const attempt = validateUserAccessToken(requestWith('Bearer stale'));
    await expect(attempt).rejects.toBeInstanceOf(HttpException);
    await attempt.catch((error: HttpException) => expect(error.getStatus()).toBe(401));
  });

  it('sets the member identity on the request for an active token', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: true, email: 'a@b.c', sub: 'uid-1' } });
    const request = requestWith('Bearer good');

    await validateUserAccessToken(request);

    expect(request).toMatchObject({ userEmail: 'a@b.c', userUid: 'uid-1', userAccessToken: 'good' });
  });
});

describe('UserAccessTokenValidateGuard', () => {
  it('delegates to validateUserAccessToken', async () => {
    mockedAxios.post.mockResolvedValue({ data: { active: true, email: 'a@b.c', sub: 'uid-1' } });
    const request = requestWith('Bearer good');
    const context: any = { switchToHttp: () => ({ getRequest: () => request }) };

    await expect(new UserAccessTokenValidateGuard().canActivate(context)).resolves.toBe(true);
    expect(request.userEmail).toBe('a@b.c');
  });
});

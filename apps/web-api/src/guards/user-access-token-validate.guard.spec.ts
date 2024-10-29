import { ExecutionContext, HttpException, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { UserAccessTokenValidateGuard } from './user-access-token-validate.guard';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('UserAccessTokenValidateGuard', () => {
  let guard: UserAccessTokenValidateGuard;
  const mockRequest = (authHeader: string | undefined) => ({
    headers: {
      authorization: authHeader,
    },
  });

  const mockExecutionContext = (authHeader: string | undefined) =>
    ({
      switchToHttp: () => ({
        getRequest: () => mockRequest(authHeader),
      }),
    } as ExecutionContext);

  beforeEach(() => {
    guard = new UserAccessTokenValidateGuard();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should throw UnauthorizedException if no token is provided', async () => {
    const context = mockExecutionContext(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow('Unauthorized Access');
  });

  it('should throw HttpException if token is invalid', async () => {
    const context = mockExecutionContext('Bearer invalidToken');
    mockedAxios.post.mockResolvedValue({ data: { active: false } });
  
    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid Session. Please login and try again');
  });
  

  it('should add userEmail, userUid, and userAccessToken to the request on successful validation', async () => {
    const mockRequest = {
      headers: {
        authorization: 'Bearer validToken',
      },
    };
  
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  
    const mockValidationResponse = {
      data: {
        active: true,
        email: 'test@example.com',
        sub: 'user-uid',
      },
    };
  
    jest.spyOn(axios, 'post').mockResolvedValue(mockValidationResponse);
  
    await guard.canActivate(mockExecutionContext);
  
    expect(mockRequest['userEmail']).toBe('test@example.com');
    expect(mockRequest['userUid']).toBe('user-uid');
    expect(mockRequest['userAccessToken']).toBe('validToken');
  });
  

  it('should throw HttpException if axios responds with error data and status', async () => {
    const context = mockExecutionContext('Bearer validToken');
    mockedAxios.post.mockRejectedValue({
      response: {
        data: { message: 'Invalid Token' },
        status: 401,
      },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid Token');
  });

  it('should throw InternalServerErrorException for unexpected errors', async () => {
    const context = mockExecutionContext('Bearer validToken');
    mockedAxios.post.mockRejectedValue(new Error('Network Error'));

    await expect(guard.canActivate(context)).rejects.toThrow(InternalServerErrorException);
  });
});

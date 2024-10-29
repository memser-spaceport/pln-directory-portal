import { ExecutionContext, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { UserAuthValidateGuard } from './user-auth-validate.guard';
import axios from 'axios';

jest.mock('axios');

describe('UserAuthValidateGuard', () => {
  let guard: UserAuthValidateGuard;
  let mockRequest: any;
  let mockContext: ExecutionContext;

  beforeEach(() => {
    guard = new UserAuthValidateGuard();
    mockRequest = {
      headers: {},
      method: 'POST',
    };
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  });

  it('should throw UnauthorizedException if no token and non-GET request', async () => {
    mockRequest.method = 'POST';
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should allow access if no token and GET request', async () => {
    mockRequest.method = 'GET';
    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });

  it('should mark isUserLoggedIn as true on request if token is valid and active', async () => {
    mockRequest.headers.authorization = 'Bearer validToken';
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true, email: 'test@example.com' },
    });

    await guard.canActivate(mockContext);
    expect(mockRequest.isUserLoggedIn).toBe(true);
  });

  it('should throw UnauthorizedException if token is inactive and non-GET request', async () => {
    mockRequest.headers.authorization = 'Bearer inactiveToken';
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: false },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if axios request fails with 400 or 401', async () => {
    mockRequest.headers.authorization = 'Bearer invalidToken';
    (axios.post as jest.Mock).mockRejectedValue({
      response: { status: 401 },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw InternalServerErrorException for unexpected axios errors', async () => {
    mockRequest.headers.authorization = 'Bearer token';
    (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

    await expect(guard.canActivate(mockContext)).rejects.toThrow(InternalServerErrorException);
  });
});

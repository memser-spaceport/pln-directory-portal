import { ExecutionContext, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import { UserTokenValidation } from './user-token-validation.guard';
import axios from 'axios';

jest.mock('axios');

describe('UserTokenValidation', () => {
  let guard: UserTokenValidation;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    guard = new UserTokenValidation();
    mockRequest = {
      headers: {},
    };
    mockContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  });

  it('should throw UnauthorizedException if token is missing', async () => {
    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token is inactive', async () => {
    mockRequest.headers.authorization = 'Bearer inactiveToken';

    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: false },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException on 400 or 401 response status', async () => {
    mockRequest.headers.authorization = 'Bearer expiredToken';

    (axios.post as jest.Mock).mockRejectedValue({
      response: { status: 401, data: { message: 'Unauthorized' } },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw InternalServerErrorException on unknown error', async () => {
    mockRequest.headers.authorization = 'Bearer someToken';

    (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

    await expect(guard.canActivate(mockContext)).rejects.toThrow(InternalServerErrorException);
  });

  it('should add userEmail to the request on successful validation', async () => {
    mockRequest.headers.authorization = 'Bearer validToken';

    const email = 'test@example.com';
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true, email },
    });

    await guard.canActivate(mockContext);
    expect(mockRequest.userEmail).toBe(email);
  });

  it('should throw UnauthorizedException if token is active but email is missing', async () => {
    mockRequest.headers.authorization = 'Bearer noEmailToken';

    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });
});

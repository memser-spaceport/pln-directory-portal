import { ExecutionContext, UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { UserAuthTokenValidation } from './user-authtoken-validation.guard';

jest.mock('axios');

describe('UserAuthTokenValidation', () => {
  let guard: UserAuthTokenValidation;
  let mockContext: ExecutionContext;
  let mockRequest: any;

  beforeEach(() => {
    guard = new UserAuthTokenValidation();
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

  it('should throw UnauthorizedException if token is invalid', async () => {
    mockRequest.headers.authorization = 'Bearer invalidToken';
    
    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: false },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException on 401 or 400 response status', async () => {
    mockRequest.headers.authorization = 'Bearer expiredToken';

    (axios.post as jest.Mock).mockRejectedValue({
      response: { status: 401, data: { message: 'Unauthorized' } },
    });

    await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw InternalServerErrorException on unknown error', async () => {
    mockRequest.headers.authorization = 'Bearer token';

    (axios.post as jest.Mock).mockRejectedValue(new Error('Network Error'));

    await expect(guard.canActivate(mockContext)).rejects.toThrow(InternalServerErrorException);
  });

  it('should return true if token is valid and active', async () => {
    mockRequest.headers.authorization = 'Bearer validToken';

    (axios.post as jest.Mock).mockResolvedValue({
      data: { active: true },
    });

    await expect(guard.canActivate(mockContext)).resolves.toBe(true);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthGuard } from './admin-auth.guard'; // Adjust the import path as necessary
import { JwtService } from '../utils/jwt/jwt.service';
import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';

describe('AdminAuthGuard', () => {
  let guard: AdminAuthGuard;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthGuard,
        {
          provide: JwtService,
          useValue: {
            validateToken: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<AdminAuthGuard>(AdminAuthGuard);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('canActivate', () => {
    it('should throw UnauthorizedException if no token is provided', async () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: undefined } }),
        }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token is invalid', async () => {
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: 'Bearer invalidToken' } }),
        }),
      } as unknown as ExecutionContext;

      (jwtService.validateToken as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should attach user payload to request if token is valid', async () => {
      const userPayload = { email: 'test@example.com', sub: '12345' };
      const mockRequest = { headers: { authorization: 'Bearer validToken' }, user: '' };
      const mockExecutionContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      (jwtService.validateToken as jest.Mock).mockResolvedValue(userPayload);

      await guard.canActivate(mockExecutionContext);

      expect(mockRequest.user).toEqual(userPayload); // Assert that the user payload was attached
    });
  });
});

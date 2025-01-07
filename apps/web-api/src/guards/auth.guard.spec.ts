import { Test, TestingModule } from '@nestjs/testing';
import { AuthGuard, InternalAuthGuard } from './auth.guard'; // Adjust the import path as necessary
import { AuthService } from '../auth/auth.service';
import { LogService } from '../shared/log.service';
import { MembersService } from '../members/members.service';
import {
  ExecutionContext,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';

describe('AuthGuard', () => {
  let authGuard: AuthGuard;
  let authService: AuthService;
  let membersService: MembersService;
  let logger: LogService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthGuard,
        {
          provide: AuthService,
          useValue: {
            checkIfTokenAttached: jest.fn(),
            validateToken: jest.fn(),
          },
        },
        {
          provide: MembersService,
          useValue: {
            findOne: jest.fn(),
            findMemberFromEmail: jest.fn(),
          },
        },
        {
          provide: LogService,
          useValue: {
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    authGuard = module.get<AuthGuard>(AuthGuard);
    authService = module.get<AuthService>(AuthService);
    membersService = module.get<MembersService>(MembersService);
    logger = module.get<LogService>(LogService);
  });

  describe('canActivate', () => {
    it('should return true if the user email matches', async () => {
      const mockRequest = {
        params: { uid: '123' },
        userEmail: 'test@example.com',
        method: 'GET',
      };

      jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue('validToken');
      jest.spyOn(authService, 'validateToken').mockResolvedValue(mockRequest);
      jest.spyOn(membersService, 'findOne').mockResolvedValue({ email: 'test@example.com' } as any);
      jest.spyOn(membersService, 'findMemberFromEmail').mockResolvedValue({ memberRoles: [] } as any);

      const result = await authGuard.canActivate({
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext);
      expect(result).toBe(true);
    });

    it('should throw ForbiddenException if the email does not match', async () => {
      const mockRequest = {
        params: { uid: '123' },
        userEmail: 'nonmatching@example.com',
        method: 'GET',
      };

      jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue('validToken');
      jest.spyOn(authService, 'validateToken').mockResolvedValue(mockRequest);
      jest.spyOn(membersService, 'findOne').mockResolvedValue({ email: 'mail@mail.com' } as any);

      await expect(
        authGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => mockRequest }),
        } as unknown as ExecutionContext)
      ).rejects.toThrow(InternalServerErrorException);
    });

    it('should throw UnauthorizedException for various error conditions', async () => {
      const mockRequest = { params: { uid: '123' }, userEmail: 'test@example.com' };

      jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue('validToken');
      jest.spyOn(authService, 'validateToken').mockRejectedValue(new UnauthorizedException());

      await expect(
        authGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => mockRequest }),
        } as unknown as ExecutionContext)
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw InternalServerErrorException for unexpected errors', async () => {
      const mockRequest = { params: { uid: '123' }, userEmail: 'test@example.com' };

      jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue('validToken');
      jest.spyOn(authService, 'validateToken').mockRejectedValue(new Error('Unexpected error'));

      await expect(
        authGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => mockRequest }),
        } as unknown as ExecutionContext)
      ).rejects.toThrow(InternalServerErrorException);
    });
  });
  describe('InternalAuthGuard', () => {
    let internalAuthGuard: InternalAuthGuard;
    let authService: AuthService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          InternalAuthGuard,
          {
            provide: AuthService,
            useValue: {
              checkIfTokenAttached: jest.fn(),
            },
          },
        ],
      }).compile();

      internalAuthGuard = module.get<InternalAuthGuard>(InternalAuthGuard);
      authService = module.get<AuthService>(AuthService);
    });

    describe('canActivate', () => {
      it('should return true if the internal token is valid', () => {
        process.env.INTERNAL_AUTH_TOKEN = '12121212aaaaa';
        const mockRequest = { headers: { authorization: 'Bearer validInternalToken' } };
        jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue(process.env.INTERNAL_AUTH_TOKEN);

        const result = internalAuthGuard.canActivate({
          switchToHttp: () => ({ getRequest: () => mockRequest }),
        } as unknown as ExecutionContext);
        expect(result).toBe(true);
      });

      it('should throw UnauthorizedException if the internal token is invalid', () => {
        const mockRequest = {
          headers: {
            authorization: 'Bearer invalidToken',
          },
        };

        jest.spyOn(authService, 'checkIfTokenAttached').mockReturnValue('invalidToken');

        expect(() =>
          internalAuthGuard.canActivate({
            switchToHttp: () => ({ getRequest: () => mockRequest }),
          } as any)
        ).toThrow(new UnauthorizedException(`Invalid Token invalidToken`));
      });

      it('should throw InternalServerErrorException for unexpected errors', () => {
        const mockRequest = {
          headers: {
            authorization: 'Bearer validToken',
          },
        };

        jest.spyOn(authService, 'checkIfTokenAttached').mockImplementation(() => {
          throw new Error('Unexpected Error');
        });

        expect(() =>
          internalAuthGuard.canActivate({
            switchToHttp: () => ({ getRequest: () => mockRequest }),
          } as ExecutionContext)
        ).toThrow(new InternalServerErrorException('Something went wrong.'));
      });
    });
  });
});

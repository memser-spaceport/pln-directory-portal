import { AdminService } from './admin.service';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '../utils/jwt/jwt.service';

describe('AdminService', () => {
  let adminService: AdminService;
  let jwtService: JwtService;

  beforeEach(() => {
    // Mock JwtService
    jwtService = {
      getSignedToken: jest.fn().mockResolvedValue('mockedToken'),
    } as unknown as JwtService;

    adminService = new AdminService(jwtService);

    // Mock environment variables
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'password';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return a signed JWT token if credentials are valid', async () => {
    const username = 'admin';
    const password = 'password';

    const result = await adminService.signIn(username, password);

    expect(result).toEqual({ code: 1, accessToken: 'mockedToken' });
    expect(jwtService.getSignedToken).toHaveBeenCalledWith(['DIRECTORYADMIN']);
  });

  it('should throw UnauthorizedException if username is invalid', async () => {
    const username = 'invalidAdmin';
    const password = 'password';

    await expect(adminService.signIn(username, password)).rejects.toThrow(UnauthorizedException);
    expect(jwtService.getSignedToken).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if password is invalid', async () => {
    const username = 'admin';
    const password = 'wrongPassword';

    await expect(adminService.signIn(username, password)).rejects.toThrow(UnauthorizedException);
    expect(jwtService.getSignedToken).not.toHaveBeenCalled();
  });
});

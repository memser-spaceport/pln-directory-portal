import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { AdminService } from './admin.service';

const jwt = { getSignedToken: jest.fn().mockResolvedValue('signed') };
const logger = { info: jest.fn(), error: jest.fn() };
const service = () => new AdminService(jwt as never, logger as never);

const saved = {
  ADMIN_LOGIN_USERNAME: process.env.ADMIN_LOGIN_USERNAME,
  ADMIN_LOGIN_PASSWORD: process.env.ADMIN_LOGIN_PASSWORD,
  ADMIN_LEGACY_LOGIN_ENABLED: process.env.ADMIN_LEGACY_LOGIN_ENABLED,
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.ADMIN_LOGIN_USERNAME = 'admin';
  process.env.ADMIN_LOGIN_PASSWORD = 'correct-horse';
  process.env.ADMIN_LEGACY_LOGIN_ENABLED = 'true';
});

afterAll(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe('AdminService.login (legacy shared credential)', () => {
  it('mints a token for the configured credential when enabled', async () => {
    await expect(service().login('admin', 'correct-horse')).resolves.toEqual({ code: 1, accessToken: 'signed' });
  });

  it('returns 404 unless ADMIN_LEGACY_LOGIN_ENABLED=true', async () => {
    delete process.env.ADMIN_LEGACY_LOGIN_ENABLED;
    await expect(service().login('admin', 'correct-horse')).rejects.toBeInstanceOf(NotFoundException);
    process.env.ADMIN_LEGACY_LOGIN_ENABLED = 'false';
    await expect(service().login('admin', 'correct-horse')).rejects.toBeInstanceOf(NotFoundException);
    expect(jwt.getSignedToken).not.toHaveBeenCalled();
  });

  it('rejects when the credential is not configured', async () => {
    delete process.env.ADMIN_LOGIN_PASSWORD;
    await expect(service().login('admin', 'undefined')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.getSignedToken).not.toHaveBeenCalled();
  });

  it('rejects a wrong password', async () => {
    await expect(service().login('admin', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.getSignedToken).not.toHaveBeenCalled();
  });

  it('rejects a wrong username', async () => {
    await expect(service().login('other', 'correct-horse')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(jwt.getSignedToken).not.toHaveBeenCalled();
  });
});

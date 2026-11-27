import axios from 'axios';
import { InternalServerErrorException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

jest.mock('axios');
jest.mock('../members/members.service', () => ({ MembersService: class MembersService {} }));
jest.mock('../teams/teams.service', () => ({ TeamsService: class TeamsService {} }));
jest.mock('../otp/email-otp.service', () => ({ EmailOtpService: class EmailOtpService {} }));
jest.mock('../shared/log.service', () => ({ LogService: class LogService {} }));
jest.mock('../analytics/service/analytics.service', () => ({ AnalyticsService: class AnalyticsService {} }));
jest.mock('../shared/prisma.service', () => ({ PrismaService: class PrismaService {} }));
jest.mock('../notifications/notification-service.client', () => ({
  NotificationServiceClient: class NotificationServiceClient {},
}));
jest.mock('../demo-days/demo-day-investor-policy.util', () => ({
  applyDemoDayParticipantPolicyAssignments: jest.fn(),
}));

describe('AuthService auth call failures', () => {
  const refresh = (service: AuthService) =>
    service.getTokenAndUserInfo({ grantType: 'refresh_token', refreshToken: 'refresh.jwt' });

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.AUTH_API_URL = 'https://auth.example';
    service = new AuthService(
      {} as any,
      {} as any,
      { info: jest.fn(), error: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any
    );
  });

  it('maps EATH004 to 401 and sends a 3s timeout', async () => {
    (axios.post as jest.Mock).mockRejectedValue({
      response: { status: 400, data: { errorCode: 'EATH004' } },
    });

    await expect(refresh(service)).rejects.toBeInstanceOf(UnauthorizedException);
    try {
      await refresh(service);
    } catch (error) {
      expect(error.getStatus()).toBe(401);
    }
    expect(axios.post).toHaveBeenCalledWith(
      'https://auth.example/auth/token',
      expect.objectContaining({ grant_type: 'refresh_token', refresh_token: 'refresh.jwt' }),
      { timeout: 3000 }
    );
  });

  it.each([
    ['a timeout', { code: 'ECONNABORTED', message: 'timeout' }],
    ['an auth service 503', { response: { status: 503, data: {} } }],
  ])('maps %s to 500', async (_label, error) => {
    (axios.post as jest.Mock).mockRejectedValue(error);

    await expect(refresh(service)).rejects.toBeInstanceOf(InternalServerErrorException);
    try {
      await refresh(service);
    } catch (caught) {
      expect(caught.getStatus()).toBe(500);
    }
  });

  it('sets the same timeout on the shared auth client', async () => {
    const cache = { store: { get: jest.fn().mockResolvedValue('client-token'), set: jest.fn() } };
    const authApi = {
      patch: jest.fn().mockResolvedValue({ data: { ok: true } }),
      interceptors: { response: { use: jest.fn() } },
    };
    (axios.create as jest.Mock).mockReturnValue(authApi);
    const withCache = new AuthService(
      {} as any,
      {} as any,
      { info: jest.fn(), error: jest.fn() } as any,
      cache as any,
      {} as any,
      {} as any,
      {} as any
    );

    await withCache.updateEmailInAuth('new@example.com', 'old@example.com', 'ext-1');

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'https://auth.example',
      timeout: 3000,
    });
  });
});

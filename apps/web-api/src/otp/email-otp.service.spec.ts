import axios from 'axios';
import { EmailOtpService } from './email-otp.service';

jest.mock('axios');

describe('EmailOtpService logging', () => {
  const OTP_TOKEN = 'otp-token-should-not-be-logged';
  const OTP_CODE = '123456';
  let logger: { info: jest.Mock; error: jest.Mock };
  let service: EmailOtpService;

  beforeEach(() => {
    logger = { info: jest.fn(), error: jest.fn() };
    const cache = { store: { get: jest.fn().mockResolvedValue('client-token'), set: jest.fn() } };
    const authApi = {
      post: jest.fn().mockResolvedValue({ data: { ok: true } }),
      interceptors: { response: { use: jest.fn() } },
    };
    (axios.create as jest.Mock).mockReturnValue(authApi);
    service = new EmailOtpService(cache as any, logger as any);
  });

  const loggedText = () => JSON.stringify([...logger.info.mock.calls, ...logger.error.mock.calls]);

  it('does not log the OTP token on resend', async () => {
    await service.resendEmailOtp(OTP_TOKEN);
    expect(logger.info).toHaveBeenCalledWith('Successfully resent email otp');
    expect(loggedText()).not.toContain(OTP_TOKEN);
  });

  it('does not log the OTP token or code on verify', async () => {
    await service.verifyEmailOtp(OTP_CODE, OTP_TOKEN);
    expect(logger.info).toHaveBeenCalledWith('Successfully validated email otp');
    expect(loggedText()).not.toContain(OTP_TOKEN);
    expect(loggedText()).not.toContain(OTP_CODE);
  });
});

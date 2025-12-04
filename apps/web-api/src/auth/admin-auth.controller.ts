import { Body, Controller, Post } from '@nestjs/common';
import { AuthOtpService } from './auth-otp.service';

class SendOtpDto {
  email: string;
}

class VerifyOtpDto {
  otpToken: string;
  code: string;
}

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly authOtp: AuthOtpService) {}

  /**
   * Request OTP code to be sent to the given email address.
   * Returns otpToken which must be used in subsequent /otp/verify call.
   */
  @Post('otp')
  async sendOtp(@Body() body: SendOtpDto) {
    const { email } = body;
    const { token } = await this.authOtp.sendOtp(email);

    return { otpToken: token };
  }

  /**
   * Verify OTP code using the given otpToken and code.
   * On success, it issues a local admin JWT for back-office access.
   */
  @Post('otp/verify')
  async verifyOtp(@Body() body: VerifyOtpDto) {
    const { otpToken, code } = body;
    const result = await this.authOtp.verifyOtp(otpToken, code);

    return {
      authToken: result.authToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
  }
}

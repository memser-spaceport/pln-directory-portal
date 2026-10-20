import { Body, Controller, Post, UseGuards, UsePipes } from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { ZodValidationPipe } from 'nestjs-zod';
import { ImpersonateMemberRequestDto } from 'libs/contracts/src/schema/auth';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { InternalAuthHeaderGuard } from '../guards/internal-auth-header.guard';
import { NoCache } from '../decorators/no-cache.decorator';
import { AuthOtpService } from './auth-otp.service';
import { AuthService } from './auth.service';

class SendOtpDto {
  email: string;
}

class VerifyOtpDto {
  otpToken: string;
  code: string;
}

@Controller('v1/admin/auth')
export class AdminAuthController {
  constructor(private readonly authOtp: AuthOtpService, private readonly authService: AuthService) {}

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

  @Post('impersonate')
  @ApiExcludeEndpoint()
  @NoCache()
  @UseGuards(AdminAuthGuard, InternalAuthHeaderGuard)
  @UsePipes(ZodValidationPipe)
  async impersonate(@Body() body: ImpersonateMemberRequestDto) {
    return this.authService.impersonateMember(body.email);
  }
}

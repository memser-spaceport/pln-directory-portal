/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';


@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('verification/send-otp')
  @NoCache()
  async sendVerificationOtp(@Body() body) {
    if(!body?.email) {
      throw new BadRequestException("Email id missing")
    }

    if(!body?.notificationToken) {
      throw new BadRequestException("Notification Token missing")
    }

    // If email id doesn't match any email in the members directory.. then throw error
    const foundUser = await this.authService.getUserInfoByEmail(body.email);
    if (!foundUser) {
      throw new BadRequestException("Email id doesnt exist")
    }

    return await this.authService.sendEmailOtpForVerification(body.email, body.notificationToken)
  }

  @Post('verification/verify-otp')
  @NoCache()
  async verifyOtp(@Body() body) {
    try {

      // Verify if OTP is valid
      const isValid = await this.authService.verifyEmailOtp(body.otp, body.otpToken, body.notificationToken)

      // If OTP is valid, then link the email with the account and get the userinfo based on email
      if (isValid) {
        const foundUser = await this.authService.getUserInfoByEmail(body.emailId);
        if (!foundUser) {
          throw new ForbiddenException('User not found')
        }

        // link the verified email with account and get new tokens
        const newTokens = await this.authService.linkEmailWithAccount(body.emailId, body.accessToken, body.notificationToken)

        // return userinfo
        return { valid: true, userInfo: foundUser, newTokens }
      }

      // Invalid OTP
      return { valid: false }

    } catch (e) {
      throw new UnauthorizedException('Unexpected error happened')
    }
  }

  @Post('token')
  @NoCache()
  async getToken(@Body() body) {
    const code = body.code;
    const result = await this.authService.getToken(code);
    return result;
  }

  @Post('token/refresh')
  @NoCache()
  async refreshAccessToken(@Body() body) {
    const token = body.token;
    const result = await this.authService.getNewTokens(token);
    return result;
  }
}

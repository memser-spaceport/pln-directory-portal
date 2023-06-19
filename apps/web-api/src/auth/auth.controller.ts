/* eslint-disable prettier/prettier */
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { LogService } from '../shared/log.service';


@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly loggerService: LogService,
    private readonly authService: AuthService) { }

  @Post('verification/send-otp')
  @NoCache()
  async sendVerificationOtp(@Body() body) {
    try {
      if (!body?.email) {
        throw new BadRequestException("Invalid Request")
      }

      if (!body?.clientToken) {
        throw new ForbiddenException("Invalid Request. Please login and try again")
      }

      // If email id doesn't match any email in the members directory.. then throw error
      const foundUser = await this.authService.getUserInfoByEmail(body.email);
      if (!foundUser) {
        throw new BadRequestException("The entered email doesn't match an email in the directory records. Please try again or contact support")
      }

      return await this.authService.sendEmailOtpForVerification(body.email, body.clientToken)

    } catch (error) {
      this.authService.handleErrors(error)
    }
  }

  @Post('verification/resend-otp')
  @NoCache()
  async resendVerificationOtp(@Body() body) {
    try {
      if (!body?.email) {
        throw new BadRequestException("Invalid Request")
      }

      if (!body?.clientToken) {
        throw new ForbiddenException("Invalid Request. Please login and try again")
      }

      // If email id doesn't match any email in the members directory.. then throw error
      const foundUser = await this.authService.getUserInfoByEmail(body.email);
      if (!foundUser) {
        throw new BadRequestException("The entered email doesn't match an email in the directory records. Please try again or contact support")
      }

      return await this.authService.resendEmailOtpForVerification(body.otpToken, body.clientToken)

    } catch (error) {
      this.authService.handleErrors(error)
    }
  }

  @Post('verification/verify-otp')
  @NoCache()
  async verifyOtp(@Body() body, @Req() req) {
    try {
      if (!body?.otp) {
        throw new BadRequestException("OTP is missing")
      }

      if (!body?.otpToken || !body?.clientToken) {
        throw new ForbiddenException("Invalid Request. Please login and try again")
      }

      // Verify if OTP is valid
      const verificationResult = await this.authService.verifyEmailOtp(body.otp, body.otpToken, body.clientToken)

      // If OTP is valid, get the userinfo based on email
      if (verificationResult.valid) {
        const foundUser = await this.authService.getUserInfoByEmail(verificationResult.recipient);
        if (!foundUser) {
          throw new ForbiddenException('Please login and try again')
        }

        // if user found by email... then link the verified email with account and get new tokens
        const newTokens = await this.authService.linkEmailWithAccount(verificationResult.recipient, body.accessToken, body.clientToken, foundUser)

        // return userinfo
        return { valid: true, userInfo: {...foundUser, isFirstTimeLogin: foundUser?.isExternalIdAvailable ? false : true }, newTokens }
      }

      // Invalid OTP
      return { valid: false }
    } catch (error) {
      this.authService.handleErrors(error)
    }
  }

  @Post('change-email/send-otp')
  @UseGuards(UserAccessTokenValidateGuard)
  @NoCache()
  async sendOtpForEmailChange(@Body() body, @Req() req) {
    try {
      // If required params not available throw error
      if (!body?.newEmail || !req?.userEmail) {
        throw new BadRequestException("Validation failed")
      }

      if (!body?.clientToken) {
        throw new ForbiddenException("Invalid Request. Please login and try again")
      }

      // New email cannot be same as old one
      if (body?.newEmail.toLowerCase().trim() === req?.userEmail.toLowerCase().trim()) {
        throw new BadRequestException("New email cannot be same as old email")
      }

      // If current email id doesn't match any email in the members directory.. then throw error
      const oldEmailIdUser = await this.authService.getUserInfoByEmail(req.userEmail);
      if (!oldEmailIdUser) {
        throw new ForbiddenException("Your email seems to have been updated recently. Please login and try again")
      }

      //If new email id matches user then throw error
      const userMatchingNewEmail = await this.authService.getUserInfoByEmail(body.newEmail);
      if (userMatchingNewEmail) {
        throw new BadRequestException("Above email id is already used. Please try again with different email id.")
      }

      return await this.authService.sendEmailOtpForVerification(body.newEmail, body.clientToken)
    } catch (e) {
      // this.loggerService.error('error', e);
      this.authService.handleErrors(e)
    }
  }

  @Post('change-email/resend-otp')
  @UseGuards(UserAccessTokenValidateGuard)
  @NoCache()
  async resendOtpForEmailChange(@Body() body, @Req() req) {
    try {
      // If required params not available throw error
      if (!body?.newEmail || !req?.userEmail) {
        throw new BadRequestException("Validation failed")
      }

      if (!body?.clientToken) {
        throw new ForbiddenException("Invalid Request. Please login and try again")
      }

      // New email cannot be same as old one
      if (body?.newEmail.toLowerCase().trim() === req?.userEmail.toLowerCase().trim()) {
        throw new BadRequestException("New email cannot be same as old email")
      }

      // If current email id doesn't match any email in the members directory.. then throw error
      const oldEmailIdUser = await this.authService.getUserInfoByEmail(req.userEmail);
      if (!oldEmailIdUser) {
        throw new ForbiddenException("Your email seems to have been updated recently. Please login and try again")
      }

      //If new email id matches user then throw error
      const userMatchingNewEmail = await this.authService.getUserInfoByEmail(body.newEmail);
      if (userMatchingNewEmail) {
        throw new BadRequestException("Above email id is already used. Please try again with different email id.")
      }

      return await this.authService.resendEmailOtpForVerification(body.otpToken, body.clientToken)
    } catch (e) {
      // this.loggerService.error('error', e);
      this.authService.handleErrors(e)
    }
  }

  @Post('change-email/verify-otp')
  @UseGuards(UserAccessTokenValidateGuard)
  @NoCache()
  async verifyOtpForEmailChange(@Body() body, @Req() req) {
    try {
      // If required params not available throw error
    if (!body?.otp || !body?.clientToken || !req?.userEmail || !body.otpToken) {
      throw new BadRequestException("Validation failed")
    }

    // Verify if OTP is valid
    const verificationResult = await this.authService.verifyEmailOtp(body.otp, body.otpToken, body.clientToken)

    // If OTP is valid, check again if user is already in system. if yes throw error
    if (verificationResult.valid) {
      const foundUser = await this.authService.getUserInfoByEmail(verificationResult.recipient);
      if (foundUser) {
        throw new BadRequestException('Invalid request')
      }

      // if user found by email... then link the verified email with account and get new tokens
      const newTokensAndUserInfo = await this.authService.updateEmailAndLinkAccount(req.userEmail, verificationResult.recipient, req.userAccessToken, body.clientToken)

      // return userinfo
      return { valid: true, ...newTokensAndUserInfo }
    }

    return false;
    } catch (error) {
      this.authService.handleErrors(error)
    }
  }




  @Get('clienttoken')
  @UseGuards(UserAccessTokenValidateGuard)
  @NoCache()
  async getClientToken() {
    return await this.authService.getClientToken()
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

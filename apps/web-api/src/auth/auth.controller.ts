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
  Res,
  Redirect,
  UsePipes,
  Put
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { LogService } from '../shared/log.service';
import { generateOAuth2State } from '../utils/helper/helper';
import { ZodValidationPipe } from 'nestjs-zod';
import { UserAuthTokenValidation } from '../guards/user-authtoken-validation.guard';
import { ResendOtpRequestDto, SendOtpRequestDto, TokenRequestDto, VerifyOtpRequestDto } from 'libs/contracts/src/schema/auth';


@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService) { }

  @Post('/otp')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  async sendOtp(@Body() sendOtpRequest: SendOtpRequestDto) {
    return await this.authService.verifyAndSendEmailOtp(sendOtpRequest.email)
  }

  @Put('/otp')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  async resendOtp(@Body() resendOtpRequest: ResendOtpRequestDto) {
    return await this.authService.resendEmailOtp(resendOtpRequest.otpToken)
  }

  @Post('/otp/verify')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  async verifyOtp(@Body() verifyOtpRequest: VerifyOtpRequestDto) {
    return await this.authService.verifyEmailOtpAndLinkAccount(verifyOtpRequest.otp, verifyOtpRequest.otpToken, verifyOtpRequest.idToken)
  }

  @Post('token')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async getToken(@Body() tokenRequest: TokenRequestDto) {
    return await this.authService.getTokenAndUserInfo(tokenRequest);
  }


  @Get('login')
  @NoCache()
  @Redirect()
  async redirectToLogin(@Res() res) {
    try {
      const state = generateOAuth2State();
      const redirectURL = `${process.env.WEB_UI_BASE_URL}/${process.env.LOGIN_REDIRECT_URL}?source=direct`;
      const url = `${process.env.AUTH_API_URL}/auth?redirect_uri=${redirectURL}
        &state=${state}&scope=openid profile&client_id=${process.env.NEXT_PUBLIC_AUTH_APP_CLIENT_ID}`;
      res.redirect(302, url);
    } catch (error) {
      res.redirect(302, `${process.env.WEB_UI_BASE_URL}/internal-error`);
    }
  }
}

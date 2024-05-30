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
  Put,
  Param
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserAccessTokenValidateGuard } from '../guards/user-access-token-validate.guard';
import { LogService } from '../shared/log.service';
import { ZodValidationPipe } from 'nestjs-zod';
import { UserAuthTokenValidation } from '../guards/user-authtoken-validation.guard';
import { AuthRequestDto, DeleteUserAccountDto, ResendOtpRequestDto, SendOtpRequestDto, TokenRequestDto, VerifyOtpRequestDto } from 'libs/contracts/src/schema/auth';


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

  @Post()
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async createAuthRequest(@Body() authRequest: AuthRequestDto) {
    return await this.authService.createAuthRequest(authRequest);
  }

  @Post('token')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async getToken(@Body() tokenRequest: TokenRequestDto) {
    return await this.authService.getTokenAndUserInfo(tokenRequest);
  }

  @Post('accounts/external/:id')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  async deleteUserAccount(@Body() deleteRequest: DeleteUserAccountDto, @Param() params) {
    return await this.authService.deleteUserAccount(deleteRequest.token, params.id);
  }
}

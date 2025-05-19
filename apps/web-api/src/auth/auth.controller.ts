import { Body, Controller, Post, UseGuards, UsePipes, Put, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { ZodValidationPipe } from '@abitia/zod-dto';
import { UserAuthTokenValidation } from '../guards/user-authtoken-validation.guard';
import {
  AuthRequestDto,
  AuthRequestSchema,
  DeleteUserAccountDto,
  DeleteUserAccountSchema,
  ResendOtpRequestDto,
  ResendOtpRequestSchema,
  SendOtpRequestDto,
  SendOtpRequestSchema,
  TokenRequestDto,
  TokenRequestSchema,
  VerifyOtpRequestDto,
  VerifyOtpRequestSchema,
} from 'libs/contracts/src/schema/auth';
import { ApiBodyFromZod } from '../decorators/api-body-from-zod';

@ApiTags('Auth')
@Controller('v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('/otp')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(SendOtpRequestSchema)
  async sendOtp(@Body() sendOtpRequest: SendOtpRequestDto) {
    return await this.authService.verifyAndSendEmailOtp(sendOtpRequest.email);
  }

  @Put('/otp')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(ResendOtpRequestSchema)
  async resendOtp(@Body() resendOtpRequest: ResendOtpRequestDto) {
    return await this.authService.resendEmailOtp(resendOtpRequest.otpToken);
  }

  @Post('/otp/verify')
  @NoCache()
  @UseGuards(UserAuthTokenValidation)
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(VerifyOtpRequestSchema)
  async verifyOtp(@Body() verifyOtpRequest: VerifyOtpRequestDto) {
    return await this.authService.verifyEmailOtpAndLinkAccount(
      verifyOtpRequest.otp,
      verifyOtpRequest.otpToken,
      verifyOtpRequest.idToken
    );
  }

  @Post()
  @NoCache()
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(AuthRequestSchema)
  async createAuthRequest(@Body() authRequest: AuthRequestDto) {
    return await this.authService.createAuthRequest(authRequest);
  }

  @Post('token')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(TokenRequestSchema)
  async getToken(@Body() tokenRequest: TokenRequestDto) {
    return await this.authService.getTokenAndUserInfo(tokenRequest);
  }

  @Post('accounts/external/:id')
  @NoCache()
  @UsePipes(ZodValidationPipe)
  @ApiBearerAuth()
  @ApiBodyFromZod(DeleteUserAccountSchema)
  async deleteUserAccount(@Body() deleteRequest: DeleteUserAccountDto, @Param() params) {
    await this.authService.deleteUserAccount(deleteRequest.token, params.id);
    return { message: 'Deleted successfully' };
  }
}

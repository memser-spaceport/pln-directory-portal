/* eslint-disable prettier/prettier */
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { NoCache } from '../decorators/no-cache.decorator';

@Controller('v1/auth/token')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post()
  @NoCache()
  async getToken(@Body() body) {
    const code = body.code;
    const result = await this.authService.getToken(code);
    return result;
  }

  @Post('refresh')
  @NoCache()
  async refreshAccessToken(@Body() body) {
    const token = body.token;
    const result = await this.authService.getNewTokens(token);
    return result;
  }
}

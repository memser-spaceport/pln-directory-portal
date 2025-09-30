/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../shared/prisma.service';
import { OtpModule } from '../otp/otp.module';
import {AnalyticsService} from "../analytics/service/analytics.service";
import {AnalyticsModule} from "../analytics/analytics.module";
@Module({
  imports: [HttpModule, OtpModule, AnalyticsModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
  exports: [AuthService]
})
export class AuthModule {}

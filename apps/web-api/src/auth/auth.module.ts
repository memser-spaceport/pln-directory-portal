/* eslint-disable prettier/prettier */
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../shared/prisma.service';
import { RedisService } from '../utils/redis/redis.service';
import { OtpModule } from '../otp/otp.module';
@Module({
  imports: [HttpModule, OtpModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, RedisService],
  exports: [AuthService]
})
export class AuthModule {}
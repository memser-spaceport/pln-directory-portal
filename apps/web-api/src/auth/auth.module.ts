/* eslint-disable prettier/prettier */
import { CacheModule, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../shared/prisma.service';
import { RedisService } from '../utils/redis/redis.service';
@Module({
  imports: [HttpModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService, RedisService],
})
export class AuthModule {}

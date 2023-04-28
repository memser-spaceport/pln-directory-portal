/* eslint-disable prettier/prettier */
import { CacheModule, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { HttpModule } from '@nestjs/axios';
import { PrismaService } from '../prisma.service';
@Module({
  imports: [CacheModule.register(), HttpModule],
  controllers: [AuthController],
  providers: [AuthService, PrismaService],
})
export class AuthModule {}

import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PrismaService } from '../prisma.service';
import { HealthController } from './health.controller';
import { HerokuHealthIndicator } from './heroku.health';
import { PrismaHealthIndicator } from './prisma.health';

@Module({
  controllers: [HealthController],
  imports: [TerminusModule, HttpModule],
  providers: [PrismaHealthIndicator, PrismaService, HerokuHealthIndicator],
})
export class HealthModule {}

import { Controller, Get, Injectable } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
} from '@nestjs/terminus';
import { NoCache } from '../decorators/no-cache.decorator';
import { PrismaHealthIndicator } from './prisma.health';

@Injectable()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealthIndicator: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  @NoCache()
  healthCheck() {
    return this.health.check([
      () => this.prismaHealthIndicator.isHealthy('prisma'),
    ]);
  }
}

import { Controller, Get, Injectable } from '@nestjs/common';
import { HealthCheck, HealthCheckService } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

@Injectable()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private primaHealthIndicator: PrismaHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.health.check([
      () => this.primaHealthIndicator.isHealthy('prisma'),
    ]);
  }
}

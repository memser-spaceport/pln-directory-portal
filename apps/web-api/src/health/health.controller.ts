import { Controller, Get, Injectable } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { HerokuHealthIndicator } from './heroku.health';
import { PrismaHealthIndicator } from './prisma.health';

@Injectable()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private prismaHealthIndicator: PrismaHealthIndicator,
    private herokuHealthIndicator: HerokuHealthIndicator,
    private http: HttpHealthIndicator
  ) {}

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.health.check([
      () => this.herokuHealthIndicator.isHealthy(),
      () => this.prismaHealthIndicator.isHealthy('prisma'),
    ]);
  }
}

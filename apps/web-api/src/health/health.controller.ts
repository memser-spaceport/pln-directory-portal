import { Controller, Get, Injectable } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';

@Injectable()
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private primaHealthIndicator: PrismaHealthIndicator,
    private http: HttpHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  healthCheck() {
    return this.health.check([
      () =>
        this.http.pingCheck(
          'heroku-status',
          'https://status.heroku.com/api/v4/current-status',
        ),
      () => this.primaHealthIndicator.isHealthy('prisma'),
    ]);
  }
}

import { Controller, Get, Res } from '@nestjs/common';
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

@Controller('metrics')
export class MetricsController {
  @Get()
  async getMetrics(@Res() res) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}

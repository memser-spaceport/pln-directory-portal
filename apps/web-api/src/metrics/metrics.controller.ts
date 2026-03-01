import { Controller, Get, Res } from '@nestjs/common';
import { register, collectDefaultMetrics } from 'prom-client';
import {NoCache} from "../decorators/no-cache.decorator";

collectDefaultMetrics();

@Controller('metrics')
export class MetricsController {
  @Get()
  @NoCache()
  async getMetrics(@Res() res) {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  }
}

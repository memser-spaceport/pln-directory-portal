import { Controller, Get, Param } from '@nestjs/common';
import { OsoMetricsService } from './oso-metrics.service';

@Controller('v1/oso-metrics')
export class OsoMetricsController {
  constructor(private readonly osoMetricsService: OsoMetricsService) {}

  @Get()
  findAll() {
    return this.osoMetricsService.findAll();
  }

  @Get(':name')
  findOne(@Param('name') name: string) {
    return this.osoMetricsService.findOne(name);
  }
}

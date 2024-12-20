import { Module } from '@nestjs/common';
import { OsoMetricsService } from './oso-metrics.service';
import { OsoMetricsController } from './oso-metrics.controller';

@Module({
  controllers: [OsoMetricsController],
  providers: [OsoMetricsService],
  exports: [OsoMetricsService],
})
export class OsoMetricsModule {}

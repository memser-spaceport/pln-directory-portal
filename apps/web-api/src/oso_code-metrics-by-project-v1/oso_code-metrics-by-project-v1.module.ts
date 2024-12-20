import { Module } from '@nestjs/common';
import { OsoCodeMetricsByProjectV1Service } from './oso_code-metrics-by-project-v1.service';
import { OsoCodeMetricsByProjectV1Controller } from './oso_code-metrics-by-project-v1.controller';

@Module({
  controllers: [OsoCodeMetricsByProjectV1Controller],
  providers: [OsoCodeMetricsByProjectV1Service],
  exports: [OsoCodeMetricsByProjectV1Service],
})
export class OsoCodeMetricsByProjectV1Module {}

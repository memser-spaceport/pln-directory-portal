import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { OsoCodeMetricsByProjectV1Service } from './oso_code-metrics-by-project-v1.service';

@Controller('v1/oso-code-metrics-by-project-v1')
export class OsoCodeMetricsByProjectV1Controller {
  constructor(private readonly osoCodeMetricsByProjectV1Service: OsoCodeMetricsByProjectV1Service) {}

  @Get()
  findAll() {
    return this.osoCodeMetricsByProjectV1Service.findAll();
  }

  @Get(':name')
  findOne(@Param('name') name: string) {
    return this.osoCodeMetricsByProjectV1Service.findOne(name);
  }
}

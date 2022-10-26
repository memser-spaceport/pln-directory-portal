import { Controller } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiFundingStages } from 'libs/contracts/src/lib/contract-funding-stages';
import { FundingStagesService } from './funding-stages.service';

const server = initNestServer(apiFundingStages);
type RouteShape = typeof server.routeShapes;

@Controller()
export class FundingStagesController {
  constructor(private readonly fundingStagesService: FundingStagesService) {}

  @Api(server.route.getFundingStages)
  findAll() {
    return this.fundingStagesService.findAll();
  }

  @Api(server.route.getFundingStage)
  @ApiParam({ name: 'uid', type: 'string' })
  findOne(@ApiDecorator() { params: { uid } }: RouteShape['getFundingStage']) {
    return this.fundingStagesService.findOne(uid);
  }
}

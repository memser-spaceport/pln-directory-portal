import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { FocusAreasService } from './focus-areas.service';

const server = initNestServer(apiFocusAreas);
type RouteShape = typeof server.routeShapes;

@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}
  @Api(server.route.getFocusAreas)
  async findAll(@Req() request: Request) {
    return await this.focusAreaService.findAll(request.query);
  }

  @Api(server.route.getFocusAreasWithRelations)
  async findAllWithRelations(@Req() request: Request) {
    return await this.focusAreaService.findAllFocusAreasWithRelations();
  }
}

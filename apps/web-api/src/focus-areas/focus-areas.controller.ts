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
  findAll(@Req() request: Request) {
    const filter = this.focusAreaService.buildTeamFilter(request.query);
    return this.focusAreaService.findAll(filter);
  }
}

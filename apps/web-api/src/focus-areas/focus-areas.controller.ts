import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { FocusAreasService } from './focus-areas.service';
import { PROJECT, TEAM } from '../utils/constants';

const server = initNestServer(apiFocusAreas);
type RouteShape = typeof server.routeShapes;

@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}
  @Api(server.route.getFocusAreas)
  findAll(@Req() request: Request) {
    let teamFilter, projectFilter = {};
    const { type } = request.query;
    if (type === TEAM) {
      teamFilter = this.focusAreaService.buildTeamFilter(request.query);
    }
    if (type === PROJECT) {
      projectFilter = this.focusAreaService.buildProjectFilter(request.query);
    }
    return this.focusAreaService.findAll(teamFilter, projectFilter);
  }
}

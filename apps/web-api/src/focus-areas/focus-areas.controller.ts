import { CacheTTL, Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { FocusAreasService } from './focus-areas.service';
import { QueryCache } from '../decorators/query-cache.decorator';
import { NoCache } from '../decorators/no-cache.decorator';

const server = initNestServer(apiFocusAreas);
type RouteShape = typeof server.routeShapes;

@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}
  @Api(server.route.getFocusAreas)
  @QueryCache()
  @CacheTTL(300)
  findAll(@Req() request: Request) {
    return this.focusAreaService.findAll(request.query);
  }
}

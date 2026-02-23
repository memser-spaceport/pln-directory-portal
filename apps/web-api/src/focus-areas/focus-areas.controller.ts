import { CacheTTL, Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { FocusAreasService } from './focus-areas.service';
import { QueryCache } from '../decorators/query-cache.decorator';

const server = initNestServer(apiFocusAreas);

@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}
  @Api(server.route.getFocusAreas)
  @QueryCache()
  @CacheTTL(60)
  findAll(@Req() request: Request) {
    return this.focusAreaService.findAll(request.query);
  }
}

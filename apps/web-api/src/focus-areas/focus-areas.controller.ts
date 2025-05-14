import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import { FocusAreasService } from './focus-areas.service';
const server = initNestServer(apiFocusAreas);

@ApiTags('Focus Areas')
@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}
  @Api(server.route.getFocusAreas)
  findAll(@Req() request: Request) {
    return this.focusAreaService.findAll(request.query);
  }
}

import { Controller, UseGuards, Param } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { 
  ResponseTeamWithRelationsSchema} from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { InternalsService } from './internals.service';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class TeamsInternalController {

  constructor(
    private readonly internalsService: InternalsService
  ) { }

  @Api(server.route.getTeamDetails)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema)
  async getTeamDetails(@Param('uid') uid: string) {
    return this.internalsService.getTeamDetails(uid);
  }

}

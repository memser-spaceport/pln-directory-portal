import { Controller, UseGuards, Param } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { 
  ResponseProjectWithRelationsSchema} from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { InternalsService } from './internals.service';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class ProjectsInternalController {

  constructor(
    private readonly internalsService: InternalsService
  ) { }

  @Api(server.route.getProjectDetails)
  @ApiOkResponseFromZod(ResponseProjectWithRelationsSchema)
  async getProjectDetails(@Param('uid') uid: string) {
    return this.internalsService.getProjectDetails(uid);
  }

}

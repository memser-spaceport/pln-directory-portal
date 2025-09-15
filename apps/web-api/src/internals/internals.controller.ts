import { Controller, UseGuards, Param } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { 
  ResponseMemberWithRelationsSchema,
  ResponseTeamWithRelationsSchema,
  ResponseProjectWithRelationsSchema,
  ResponsePLEventSchemaWithRelationsSchema
} from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';
import { InternalsService } from './internals.service';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class InternalsController {

  constructor(
    private readonly internalsService: InternalsService
  ) { }

  @Api(server.route.getMemberDetails)
  @ApiOkResponseFromZod(ResponseMemberWithRelationsSchema)
  async getMemberDetails(@Param('uid') uid: string) {
    const result = await this.internalsService.getMemberDetails(uid);
    return result;
  }

  @Api(server.route.getTeamDetails)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema)
  async getTeamDetails(@Param('uid') uid: string) {
    return this.internalsService.getTeamDetails(uid);
  }

  @Api(server.route.getProjectDetails)
  @ApiOkResponseFromZod(ResponseProjectWithRelationsSchema)
  async getProjectDetails(@Param('uid') uid: string) {
    return this.internalsService.getProjectDetails(uid);
  }

  @Api(server.route.getIrlEventDetails)
  @ApiOkResponseFromZod(ResponsePLEventSchemaWithRelationsSchema)
  async getIrlEventDetails(@Param('uid') uid: string) {
    return this.internalsService.getIrlEventDetails(uid);
  }
}

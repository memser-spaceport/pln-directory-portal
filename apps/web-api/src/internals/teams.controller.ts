import { Controller, UseGuards, Param, BadRequestException, Req } from '@nestjs/common';
import { Request } from 'express';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { 
  ResponseTeamWithRelationsSchema,
  ResponseTeamSearchResultSchema
} from 'libs/contracts/src/schema';
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

  /**
   * Search teams by name using OpenSearch.
   * Used by Events Service for host/sponsor entity association matching, etc.
   */
  @Api(server.route.searchTeams)
  @ApiOkResponseFromZod(ResponseTeamSearchResultSchema)
  async searchTeams(@Req() request: Request) {
    const { searchTerm, limit } = request.query;
    return await this.internalsService.searchTeams({
      searchTerm: searchTerm as string,
      limit: Number(limit) || 5,
    });
  }
}

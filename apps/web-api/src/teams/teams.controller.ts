import { Controller, Req, UseGuards, Body, Param } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTeam } from 'libs/contracts/src/lib/contract-team';
import {
  ResponseTeamWithRelationsSchema,
  TeamDetailQueryParams,
  TeamQueryParams,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { TeamsService } from './teams.service';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import {
  ParticipantRequestTeamSchema,
} from '../../../../libs/contracts/src/schema/participants-request';

const server = initNestServer(apiTeam);
type RouteShape = typeof server.routeShapes;
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Api(server.route.getTeams)
  @ApiQueryFromZod(TeamQueryParams)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema.array())
  @NoCache()
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTeamWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.teamsService.findAll(builtQuery);
  }

  @Api(server.route.getTeam)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiQueryFromZod(TeamDetailQueryParams)
  @NoCache()
  findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getTeam']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTeamWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.teamsService.findOne(uid, builtQuery);
  }

  @Api(server.route.modifyTeam)
  @UseGuards(UserTokenValidation)
  async updateOne(@Param('id') id, @Body() body, @Req() req) {
    const participantsRequest = body;
    return await this.teamsService.editTeamParticipantsRequest(participantsRequest, req.userEmail);
  }
}

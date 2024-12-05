import { Controller, Req, UseGuards, Body, Param, UsePipes } from '@nestjs/common';
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
import { ParticipantsReqValidationPipe } from '../pipes/participant-request-validation.pipe';

const server = initNestServer(apiTeam);
type RouteShape = typeof server.routeShapes;
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) { }

  @Api(server.route.teamFilters)
  @ApiQueryFromZod(TeamQueryParams)
  async getTeamFilters(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTeamWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const { focusAreas }: any = request.query;
    builtQuery.where = {
      AND: [
        builtQuery.where ? builtQuery.where : {},
        this.teamsService.buildFocusAreaFilters(focusAreas),
        this.teamsService.buildRecentTeamsFilter(request.query)
      ]
    }
    return await this.teamsService.getTeamFilters(builtQuery);
  }

  @Api(server.route.getTeams)
  @ApiQueryFromZod(TeamQueryParams)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTeamWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    const { focusAreas }: any = request.query;
    builtQuery.where = {
      AND: [
        builtQuery.where ? builtQuery.where : {},
        this.teamsService.buildFocusAreaFilters(focusAreas),
        this.teamsService.buildRecentTeamsFilter(request.query)
      ]
    }
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
    return this.teamsService.findTeamByUid(uid, builtQuery);
  }

  @Api(server.route.modifyTeam)
  @UseGuards(UserTokenValidation)
  @UsePipes(new ParticipantsReqValidationPipe())
  async updateOne(@Param('uid') teamUid, @Body() body, @Req() req) {
    await this.teamsService.validateRequestor(req.userEmail, teamUid);
    return await this.teamsService.updateTeamFromParticipantsRequest(teamUid, body, req.userEmail);
  }

}

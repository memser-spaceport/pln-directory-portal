import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTeam } from 'libs/contracts/src/lib/contract-team';
import {
  ResponseTeamWithRelationsSchema,
  TeamQueryParams,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import {
  NOT_FOUND_GLOBAL_RESPONSE_SCHEMA,
  RETRIEVAL_QUERY_FILTERS,
} from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { TeamsService } from './teams.service';

const server = initNestServer(apiTeam);
type RouteShape = typeof server.routeShapes;
@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Api(server.route.getTeams)
  @ApiQueryFromZod(TeamQueryParams)
  @ApiOkResponseFromZod(ResponseTeamWithRelationsSchema.array())
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
  @ApiQueryFromZod(TeamQueryParams, RETRIEVAL_QUERY_FILTERS)
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
}

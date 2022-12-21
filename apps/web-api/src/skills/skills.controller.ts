import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiSkills } from 'libs/contracts/src/lib/contract-skills';
import {
  ResponseSkillSchema,
  SkillQueryParams,
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
import { SkillsService } from './skills.service';

const server = initNestServer(apiSkills);
type RouteShape = typeof server.routeShapes;

@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Api(server.route.getSkills)
  @ApiQueryFromZod(SkillQueryParams)
  @ApiOkResponseFromZod(ResponseSkillSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseSkillSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.skillsService.findAll(builtQuery);
  }

  @Api(server.route.getSkill)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiOkResponseFromZod(ResponseSkillSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  @ApiQueryFromZod(SkillQueryParams, RETRIEVAL_QUERY_FILTERS)
  findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getSkill']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseSkillSchema);
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.skillsService.findOne(uid, builtQuery);
  }
}

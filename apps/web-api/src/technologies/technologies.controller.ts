import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiTechnologies } from 'libs/contracts/src/lib/contract-technology';
import {
  ResponseTechnologySchema,
  TechnologyDetailQueryParams,
  TechnologyQueryParams,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { TechnologiesService } from './technologies.service';

const server = initNestServer(apiTechnologies);
type RouteShape = typeof server.routeShapes;

@Controller()
export class TechnologiesController {
  constructor(private readonly technologiesService: TechnologiesService) {}

  @Api(server.route.getTechnologies)
  @ApiQueryFromZod(TechnologyQueryParams)
  @ApiOkResponseFromZod(ResponseTechnologySchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTechnologySchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.technologiesService.findAll(builtQuery);
  }

  @Api(server.route.getTechnology)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(TechnologyDetailQueryParams)
  @ApiOkResponseFromZod(ResponseTechnologySchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getTechnology']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseTechnologySchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.technologiesService.findOne(uid, builtQuery);
  }
}

import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiIndustryTags } from 'libs/contracts/src/lib/contract-industry-tags';
import {
  IndustryTagDetailQueryParams,
  IndustryTagQueryParams,
  ResponseIndustryTagSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { IndustryTagsService } from './industry-tags.service';

const server = initNestServer(apiIndustryTags);
type RouteShape = typeof server.routeShapes;

@Controller()
export class IndustryTagsController {
  constructor(private readonly industryTagsService: IndustryTagsService) {}

  @Api(server.route.getIndustryTags)
  @ApiQueryFromZod(IndustryTagQueryParams)
  @ApiOkResponseFromZod(ResponseIndustryTagSchema.array())
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseIndustryTagSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.industryTagsService.findAll(builtQuery);
  }

  @Api(server.route.getIndustryTag)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(IndustryTagDetailQueryParams)
  @ApiOkResponseFromZod(ResponseIndustryTagSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getIndustryTag']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseIndustryTagSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.industryTagsService.findOne(uid, builtQuery);
  }

  // @Api(server.route.createIndustryTag)
  // async create(@ApiDecorator() { body }: RouteShape['createIndustryTag']) {
  //   const tag = await this.industryTagsService.create(body);

  //   if (!tag) return { status: 404 as const, body: null };

  //   return { status: 200 as const, body: tag };
  // }

  // @Api(server.route.updateIndustryTag)
  // update(
  //   @ApiDecorator() { body, params: { uid } }: RouteShape['updateIndustryTag']
  // ) {
  //   const tag = this.industryTagsService.update(uid, body);

  //   return { status: 200 as const, body: tag };
  // }

  // @Api(server.route.deleteIndustryTag)
  // remove(@ApiDecorator() { params: { uid } }: RouteShape['deleteIndustryTag']) {
  //   this.industryTagsService.remove(uid);
  //   return { status: 204 as const, body: null };
  // }
}

import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiMembershipSource } from 'libs/contracts/src/lib/contract-membership-source';
import {
  MembershipSourceDetailQueryParams,
  MembershipSourceQueryParams,
  ResponseMembershipSourceSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { MembershipSourcesService } from './membership-sources.service';

const server = initNestServer(apiMembershipSource);
type RouteShape = typeof server.routeShapes;

@ApiTags('Membership Sources')
@Controller()
export class MembershipSourcesController {
  constructor(
    private readonly membershipSourcesService: MembershipSourcesService
  ) {}

  @Api(server.route.getMembershipSources)
  @ApiQueryFromZod(MembershipSourceQueryParams)
  @ApiOkResponseFromZod(ResponseMembershipSourceSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMembershipSourceSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.membershipSourcesService.findAll(builtQuery);
  }

  @Api(server.route.getMembershipSource)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(MembershipSourceDetailQueryParams)
  @ApiOkResponseFromZod(ResponseMembershipSourceSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  async findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getMembershipSource']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseMembershipSourceSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.membershipSourcesService.findOne(uid, builtQuery);
  }
}

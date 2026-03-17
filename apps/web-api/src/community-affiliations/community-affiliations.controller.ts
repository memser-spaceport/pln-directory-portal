import { CacheTTL, Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiCommunityAffiliation } from 'libs/contracts/src/lib/contract-community-affiliation';
import {
  CommunityAffiliationDetailQueryParams,
  CommunityAffiliationQueryParams,
  ResponseCommunityAffiliationSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { CommunityAffiliationsService } from './community-affiliations.service';
import { QueryCache } from '../decorators/query-cache.decorator';

const server = initNestServer(apiCommunityAffiliation);
type RouteShape = typeof server.routeShapes;

@Controller()
export class CommunityAffiliationsController {
  constructor(private readonly communityAffiliationsService: CommunityAffiliationsService) {}

  @Api(server.route.getCommunityAffiliations)
  @ApiQueryFromZod(CommunityAffiliationQueryParams)
  @ApiOkResponseFromZod(ResponseCommunityAffiliationSchema.array())
  @QueryCache()
  @CacheTTL(60)
  findAll(@Req() request: Request) {
    return this.communityAffiliationsService.findAll(request.query);
  }

  @Api(server.route.getCommunityAffiliation)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(CommunityAffiliationDetailQueryParams)
  @ApiOkResponseFromZod(ResponseCommunityAffiliationSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  async findOne(@Req() request: Request, @ApiDecorator() { params: { uid } }: RouteShape['getCommunityAffiliation']) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseCommunityAffiliationSchema);
    const builder = new PrismaQueryBuilder(queryableFields, ENABLED_RETRIEVAL_PROFILE);
    const builtQuery = builder.build(request.query);
    return this.communityAffiliationsService.findOne(uid, builtQuery);
  }
}

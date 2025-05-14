import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam, ApiTags } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFundingStages } from 'libs/contracts/src/lib/contract-funding-stages';
import {
  FundingStageDetailQueryParams,
  FundingStageQueryParams,
  ResponseFundingStageSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { FundingStagesService } from './funding-stages.service';

const server = initNestServer(apiFundingStages);
type RouteShape = typeof server.routeShapes;

@ApiTags('Funding Stages')
@Controller()
export class FundingStagesController {
  constructor(private readonly fundingStagesService: FundingStagesService) {}

  @Api(server.route.getFundingStages)
  @ApiQueryFromZod(FundingStageQueryParams)
  @ApiOkResponseFromZod(ResponseFundingStageSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseFundingStageSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.fundingStagesService.findAll(builtQuery);
  }

  @Api(server.route.getFundingStage)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(FundingStageDetailQueryParams)
  @ApiOkResponseFromZod(ResponseFundingStageSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getFundingStage']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseFundingStageSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.fundingStagesService.findOne(uid, builtQuery);
  }
}

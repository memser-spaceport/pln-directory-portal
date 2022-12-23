import { Controller, Req } from '@nestjs/common';
import { ApiNotFoundResponse, ApiParam } from '@nestjs/swagger';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiAcceleratorProgram } from 'libs/contracts/src/lib/contract-accelerator-program';
import {
  AcceleratorProgramDetailQueryParams,
  AcceleratorProgramQueryParams,
  ResponseAcceleratorProgramSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { NOT_FOUND_GLOBAL_RESPONSE_SCHEMA } from '../utils/constants';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { ENABLED_RETRIEVAL_PROFILE } from '../utils/prisma-query-builder/profile/defaults';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { AcceleratorProgramsService } from './accelerator-programs.service';

const server = initNestServer(apiAcceleratorProgram);
type RouteShape = typeof server.routeShapes;

@Controller()
export class AcceleratorProgramsController {
  constructor(
    private readonly acceleratorProgramsService: AcceleratorProgramsService
  ) {}

  @Api(server.route.getAcceleratorPrograms)
  @ApiQueryFromZod(AcceleratorProgramQueryParams)
  @ApiOkResponseFromZod(ResponseAcceleratorProgramSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseAcceleratorProgramSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.acceleratorProgramsService.findAll(builtQuery);
  }

  @Api(server.route.getAcceleratorProgram)
  @ApiParam({ name: 'uid', type: 'string' })
  @ApiQueryFromZod(AcceleratorProgramDetailQueryParams)
  @ApiOkResponseFromZod(ResponseAcceleratorProgramSchema)
  @ApiNotFoundResponse(NOT_FOUND_GLOBAL_RESPONSE_SCHEMA)
  async findOne(
    @Req() request: Request,
    @ApiDecorator() { params: { uid } }: RouteShape['getAcceleratorProgram']
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponseAcceleratorProgramSchema
    );
    const builder = new PrismaQueryBuilder(
      queryableFields,
      ENABLED_RETRIEVAL_PROFILE
    );
    const builtQuery = builder.build(request.query);
    return this.acceleratorProgramsService.findOne(uid, builtQuery);
  }
}

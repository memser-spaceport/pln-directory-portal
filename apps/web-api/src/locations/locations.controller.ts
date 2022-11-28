import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiLocations } from '../../../../libs/contracts/src/lib/contract-locations';
import { LocationsService } from './locations.service';
import {
  LocationQueryParams,
  LocationResponseSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { Request } from 'express';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';

const server = initNestServer(apiLocations);

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Api(server.route.getLocations)
  @ApiQueryFromZod(LocationQueryParams)
  @ApiOkResponseFromZod(LocationResponseSchema.array())
  async findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(
      LocationResponseSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.locationsService.findAll(builtQuery);
  }
}

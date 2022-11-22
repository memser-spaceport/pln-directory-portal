import { Controller } from '@nestjs/common';
import { Api, ApiDecorator, initNestServer } from '@ts-rest/nest';
import { apiLocations } from '../../../../libs/contracts/src/lib/contract-locations';
import { LocationsService } from './locations.service';
import {
  LocationQueryParams,
  LocationResponseSchema,
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';

const server = initNestServer(apiLocations);
type RouteShape = typeof server.routeShapes;

@Controller()
export class LocationsController {
  constructor(private readonly locationsService: LocationsService) {}

  @Api(server.route.getLocations)
  @ApiQueryFromZod(LocationQueryParams)
  @ApiOkResponseFromZod(LocationResponseSchema)
  async findAll(@ApiDecorator() { query }: RouteShape['getLocations']) {
    // NOTE: This is purposedly incomplete & messy as it will be replaced with Prisma Query Builder:
    return this.locationsService.findAll({
      ...(!!query?.distinct && {
        // any being used due to unsolved mismatch between array of strings and typed prisma enum
        distinct: query.distinct.split(',') as any,
      }),
      ...(!!query?.select && {
        select: query.select
          .split(',')
          .reduce((acc, val) => ({ ...acc, [val]: true }), {}),
      }),
    });
  }
}

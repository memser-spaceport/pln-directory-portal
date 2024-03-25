import { Controller, Req } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { Request } from 'express';
import { apiFocusAreas } from 'libs/contracts/src/lib/contract-focus-areas';
import {
  ResponseFocusAreaSchema,
  FocusAreaQueryParams
} from 'libs/contracts/src/schema';
import { ApiQueryFromZod } from '../decorators/api-query-from-zod';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { FocusAreasService } from './focus-areas.service';

const server = initNestServer(apiFocusAreas);
type RouteShape = typeof server.routeShapes;

@Controller()
export class FocusAreaController {
  constructor(private readonly focusAreaService: FocusAreasService) {}

  @Api(server.route.getSkills)
  @ApiQueryFromZod(FocusAreaQueryParams)
  @ApiOkResponseFromZod(ResponseFocusAreaSchema.array())
  findAll(@Req() request: Request) {
    const queryableFields = prismaQueryableFieldsFromZod(ResponseFocusAreaSchema);
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return this.focusAreaService.findAll(builtQuery);
  }

}

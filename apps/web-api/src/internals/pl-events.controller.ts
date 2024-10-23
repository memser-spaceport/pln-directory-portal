import { Controller, UseGuards, Req, Param } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { Api, initNestServer, ApiDecorator } from '@ts-rest/nest';
import { apiInternals } from 'libs/contracts/src/lib/contract-internals';
import { ResponsePLEventGuestSchemaWithRelationsSchema } from 'libs/contracts/src/schema';
import { ApiOkResponseFromZod } from '../decorators/api-response-from-zod';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { PrismaQueryBuilder } from '../utils/prisma-query-builder';
import { prismaQueryableFieldsFromZod } from '../utils/prisma-queryable-fields-from-zod';
import { InternalAuthGuard } from '../guards/auth.guard';

const server = initNestServer(apiInternals);
type RouteShape = typeof server.routeShapes;

@Controller("")
@UseGuards(InternalAuthGuard)
export class PLEventsInternalController {
  constructor(
    private readonly eventGuestsService: PLEventGuestsService, 
  ) {}

  @Api(server.route.getPLEventGuestsByLocation)
  @ApiOkResponseFromZod(ResponsePLEventGuestSchemaWithRelationsSchema)
  async fetchEventGuests(
    @Param("uid") locationUid,
    @Req() request: Request
  ) {
    const queryableFields = prismaQueryableFieldsFromZod(
      ResponsePLEventGuestSchemaWithRelationsSchema
    );
    const builder = new PrismaQueryBuilder(queryableFields);
    const builtQuery = builder.build(request.query);
    return await this.eventGuestsService.getPLEventGuestsByLocation(locationUid, builtQuery);
  }
}

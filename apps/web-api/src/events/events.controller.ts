import { Body, Controller, Query, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { apiPLEvents } from 'libs/contracts/src/lib/contract-events';
import { EventsService } from './events.service';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';
import { PLEventLocationAssociationService } from '../pl-events/pl-event-location-association.service';
import { InternalAuthGuard } from '../guards/auth.guard';

const server = initNestServer(apiPLEvents);
type RouteShape = typeof server.routeShapes;

@Controller()
@SkipEmptyStringToNull()
export class EventsController {
  constructor(
    private readonly eventService: EventsService,
    private readonly locationAssociationService: PLEventLocationAssociationService
  ) { }

  @Api(server.route.createEvent)
  @UseGuards(UserTokenValidation)
  async createPLEvent(
    @Body() body,
    @Req() request
  ) {
    return await this.eventService.submitPLEvent(body, request['userEmail']);
  }

  @Api(server.route.fetchAssociations)
  @UseGuards(InternalAuthGuard)
  async fetchLocationAssociation(
    @Query() query
  ) {
    const locations = query.locations ? JSON.parse(query.locations):[];
    return await this.locationAssociationService.fetchAssociationsByLocationCriteria(locations);
  }
}


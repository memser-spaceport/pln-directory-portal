import { Body, Controller, Req, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { apiPLEvents } from 'libs/contracts/src/lib/contract-events';
import { EventsService } from './events.service';
import { SkipEmptyStringToNull } from '../decorators/skip-empty-string-to-null.decorator';


const server = initNestServer(apiPLEvents);
type RouteShape = typeof server.routeShapes;


@Controller()
@SkipEmptyStringToNull()
export class EventsController {
  constructor(
    private readonly eventService: EventsService
  ) { }

  @Api(server.route.createEvent)
  @UseGuards(UserTokenValidation)
  async createPLEvent(
    @Body() body,
    @Req() request
  ) {
    return await this.eventService.submitPLEvent(body, request['userEmail']);
  }
}


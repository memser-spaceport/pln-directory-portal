import { BadRequestException, Body, Controller, HttpCode, NotFoundException, Query, UseGuards } from '@nestjs/common';
import { Api, initNestServer } from '@ts-rest/nest';
import { apiEvents } from 'libs/contracts/src/lib/contract-pl-events';
import {
  eventIssuesMessage,
  PLEventAgendaParseBody,
  PLEventAgendaParseBodySchema,
} from 'libs/contracts/src/schema/pl-event-body';
import { NoCache } from '../decorators/no-cache.decorator';
import { UserTokenValidation } from '../guards/user-token-validation.guard';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { PLEventFormHelpersService } from './pl-event-form-helpers.service';
import { isLocalEventSubmitEnabled } from './pl-event-submit.constants';

const server = initNestServer(apiEvents);

function one(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Lookups the event submit form uses while it is filled in (LAB-3343): venue suggestions, a place's address and
 * time zone, and agenda text to sessions. Each keeps a key on the server. The form is for signed-in members, so
 * every route needs a user token (401 without one) and uses the normal member rate limit.
 *
 * Listed before `PLEventsController` in the module, so `/v1/irl/events/places` is matched before `/:uid`.
 * Every route answers 404 while `EVENTS_LOCAL_SUBMIT_ENABLED` is off.
 */
@Controller()
@UseGuards(UserTokenValidation)
export class PLEventFormHelpersController {
  constructor(
    private readonly locationTransferService: LocationTransferService,
    private readonly formHelpersService: PLEventFormHelpersService
  ) {}

  @Api(server.route.searchPLEventPlaces)
  @NoCache()
  async searchPlaces(@Query() query: Record<string, unknown>) {
    this.assertEnabled();
    const text = one(query?.query);
    if (!text) {
      throw new BadRequestException('query is required');
    }
    return await this.locationTransferService.searchVenues(text);
  }

  @Api(server.route.resolvePLEventPlace)
  @NoCache()
  async resolvePlace(@Query() query: Record<string, unknown>) {
    this.assertEnabled();
    const placeId = one(query?.placeId);
    const address = one(query?.address);
    if (!placeId && !address) {
      throw new BadRequestException('placeId or address is required');
    }
    return await this.locationTransferService.resolvePlace({ placeId, address });
  }

  @Api(server.route.parsePLEventAgenda)
  @HttpCode(200)
  @NoCache()
  async parseAgenda(@Body() rawBody: unknown) {
    this.assertEnabled();
    const parsed = PLEventAgendaParseBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException(eventIssuesMessage(parsed.error.issues));
    }
    return await this.formHelpersService.parseAgenda(parsed.data as PLEventAgendaParseBody);
  }

  private assertEnabled(): void {
    if (!isLocalEventSubmitEnabled()) {
      throw new NotFoundException();
    }
  }
}

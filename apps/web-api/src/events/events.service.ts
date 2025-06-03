import { BadRequestException, Injectable, UnauthorizedException, ForbiddenException, NotFoundException, ConflictException, HttpException, GatewayTimeoutException, ServiceUnavailableException, InternalServerErrorException } from '@nestjs/common';
import axios from 'axios';
import { PLEventLocationsService } from '../pl-events/pl-event-locations.service';
import { LogService } from '../shared/log.service';
import { PLEventType } from '@prisma/client';
import { EventsToolingService } from './events-tooling.service';

@Injectable()
export class EventsService {
  constructor(
    private logger: LogService,
    private locationService: PLEventLocationsService,
    private eventsToolingService: EventsToolingService
  ) { }

  /**
   * Submits a new event to the event service.
   * 
   * @param event - The event data to be submitted.
   * @param requestorEmail - The email address of the requestor.
   * @returns The response from the event service.
   */
  async submitPLEvent(event, requestorEmail: string) {
    try {
      if (event?.format != PLEventType.VIRTUAL) {
        await this.createEventLocation(event);
      }
      return await this.eventsToolingService.createEvent(event, requestorEmail);
    } catch (error) {
      this.handleAxiosError(error);
    }
  }

  /**
   * Creates a new event location if it doesn't already exist.
   * 
   * @param event - The event data containing the location information.
   * @returns The created location object if it was created, or null if it already exists.
   */
  async createEventLocation(event) {
    try {
      const eventLocationName = event?.address_info?.city || event?.address_info?.country;
      await this.locationService.createPLEventLocation({ location: eventLocationName.toLowerCase(), timezone: event?.timezone, latitude: event?.address_info?.latitude, longitude: event?.address_info?.longitude });
    } catch (error) {
      throw error;
    }
  }

  private handleAxiosError(error) {
    const url = error.config?.url || 'unknown URL';
    this.logger.error(`Error occurred while submitting event: ${error.message}`);
    if (error.response) {
      const status = error.response.status || 500;
      const errorData = error.response.data?.message || error.response.data || 'An error occurred while processing the request.';
      switch (status) {
        case 400:
          throw new BadRequestException(`Invalid event data provided. ${errorData.message}`);
        case 401:
          throw new UnauthorizedException(`You are not authorized to perform this action. Please log in and try again. : ${errorData.message}`);
        case 403:
          throw new ForbiddenException(`You do not have permission to perform this action. : ${errorData.message}`);
        case 404:
          throw new NotFoundException(`The requested event or resource was not found. : ${errorData.message}`);
        case 409:
          throw new ConflictException(`A conflict occurred while processing your request. Please check for duplicates or conflicting data. : ${errorData.message}`);
        default:
          throw new HttpException(`An unexpected error occurred while creating event.}`, status);
      }
    }
    if (error.request) {
      throw new BadRequestException(`No response received from event service (${url}). Please try again later.`);
    } else if (error.code === 'ECONNREFUSED') {
      throw new NotFoundException(`Could not connect to event service (${url}). Please try again later.`);
    } else if (error.code === 'ECONNABORTED') {
      throw new NotFoundException(`Request to event service timed out (${url}). Please try again.`);
    } else {
      throw new InternalServerErrorException('An unexpected error occurred while creating event.');
    }
  }
}


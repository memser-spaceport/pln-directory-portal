import { BadRequestException, Injectable } from '@nestjs/common';
import { LogService } from '../shared/log.service';
import axios from 'axios';

@Injectable()
export class EventsToolingService {

  constructor(private logger: LogService) { }

  /**
   * Creates a new event.
   * 
   * @param event - The event data to be created.
   * @param requestorEmail - The email address of the requestor.
   * @returns The response from the event service.
   */
  async createEvent(event, requestorEmail: string) {
    try {
      const baseUrl = process.env.EVENT_SERVICE_BASE_URL;
      if (!baseUrl) {
        throw new BadRequestException('Event service base url is not set in ENV');
      }
      const clientSecret = process.env.EVENT_SERVICE_SECRET;
      const internalAuthToken = process.env.EVENT_SERVICE_INTERNAL_AUTH_TOKEN;
      if (!clientSecret || !internalAuthToken) {
        throw new BadRequestException('Event service secret or internal auth token is not set in ENV variables');
      }
      const response = await axios.post(
        `${baseUrl}/internals/events/submit`,
        { event: event, requestorEmail: requestorEmail },
        {
          headers: {
            'x-client-secret': clientSecret,
            'x-internal-auth-token': internalAuthToken
          }
        }
      );
      this.logger.info(`Event submitted successfully: ${response?.data?.event_name}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
}

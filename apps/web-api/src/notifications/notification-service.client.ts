import axios from 'axios';
import { Injectable, Logger } from '@nestjs/common';
import {
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
  HttpException,
  InternalServerErrorException,
} from '@nestjs/common';

@Injectable()
export class NotificationServiceClient {
  private readonly logger = new Logger(NotificationServiceClient.name);
  private notificationServiceBaseUrl: string;
  private notificationServiceSecret: string;

  constructor() {
    this.notificationServiceBaseUrl = process.env.NOTIFICATION_SERVICE_BASE_URL as string;
    this.notificationServiceSecret = process.env.NOTIFICATION_SERVICE_CLIENT_SECRET as string;

    if (!this.notificationServiceBaseUrl) {
      this.logger.error('NOTIFICATION_SERVICE_BASE_URL is not defined in the environment variables.');
    }
    if (!this.notificationServiceSecret) {
      this.logger.error('NOTIFICATION_SERVICE_CLIENT_SECRET is not defined in the environment variables.');
    }
  }

  /**
   * Sends a notification using the specified payload.
   * Handles potential errors during the API request.
   *
   * @param payload - The data to send with the notification request.
   * @returns A Promise that resolves to the response from the API, or throws an error if the request fails.
   */
  async sendNotification(payload: any) {
    try {
      return await axios.post(`${this.notificationServiceBaseUrl}/notifications`, payload, {
        headers: {
          Authorization: `Basic ${this.notificationServiceSecret}`,
        },
      });
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Check if the error is an Axios-specific error
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Notification payload is invalid or malformed.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Endpoint not found. Verify the URL.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        // Handle errors unrelated to Axios (e.g., runtime exceptions)
        throw new InternalServerErrorException('Unexpected error during notification sending.');
      }
    }
  }

  /**
   * Gets notification settings for a member.
   * If not found, creates default settings.
   *
   * @param memberUid - The member UID to get notification settings for.
   * @returns A Promise that resolves to the notification settings.
   */
  async getNotificationSetting(memberUid: string) {
    try {
      const response = await axios.get(`${this.notificationServiceBaseUrl}/notification-settings/${memberUid}`, {
        headers: {
          Authorization: `Basic ${this.notificationServiceSecret}`,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid member UID format.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Notification settings not found for member UID: ' + memberUid);
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during notification settings retrieval.');
      }
    }
  }

  /**
   * Upserts notification settings for a member.
   *
   * @param memberUid - The member UID to upsert notification settings for.
   * @param settings - The notification settings data.
   * @returns A Promise that resolves to the upserted notification settings.
   */
  async upsertNotificationSetting(memberUid: string, settings: any) {
    try {
      const response = await axios.put(
        `${this.notificationServiceBaseUrl}/notification-settings/${memberUid}`,
        settings,
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Notification settings payload is invalid or malformed.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Endpoint not found. Verify the URL.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during notification settings upsert.');
      }
    }
  }

  /**
   * Finds a notification setting item for a member by type and optional contextId.
   * @param memberUid - The member UID.
   * @param type - The item type.
   * @param contextId - The context ID (optional).
   */
  async findItem(memberUid: string, type: string, contextId?: string) {
    try {
      const response = await axios.get(
        `${this.notificationServiceBaseUrl}/notification-settings/${memberUid}/item/${type}` +
          (contextId ? `?contextId=${encodeURIComponent(contextId)}` : ''),
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid parameters for findItem.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Notification setting item not found.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during findItem.');
      }
    }
  }

  /**
   * Upserts a notification setting item for a member by type and contextId.
   * @param memberUid - The member UID.
   * @param type - The item type.
   * @param dto - The item DTO (should include contextId, settings, memberExternalId).
   */
  async upsertItem(memberUid: string, type: string, dto: any) {
    try {
      const response = await axios.put(
        `${this.notificationServiceBaseUrl}/notification-settings/${memberUid}/item/${type}`,
        dto,
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid payload for upsertItem.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Notification setting item endpoint not found.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during upsertItem.');
      }
    }
  }

  /**
   * Creates an event subscriber.
   * @param subscriberData - The event subscriber data (email, eventType, name, date, memberId).
   * @returns A Promise that resolves to the created event subscriber.
   */
  async createEventSubscriber(subscriberData: { email: string; eventType: string; name?: string; memberId?: string }) {
    try {
      const response = await axios.post(`${this.notificationServiceBaseUrl}/event-subscribers`, subscriberData, {
        headers: {
          Authorization: `Basic ${this.notificationServiceSecret}`,
          'Content-Type': 'application/json',
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid event subscriber payload.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 409:
            throw new HttpException('Event subscriber already exists.', 409);
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during event subscriber creation.');
      }
    }
  }

  /**
   * Gets an event subscriber by email and event type.
   * @param email - The subscriber email.
   * @param eventType - The event type (e.g., "DEMO_DAY").
   * @returns A Promise that resolves to the event subscriber.
   */
  async getEventSubscriberByEmailAndType(email: string, eventType: string) {
    try {
      const response = await axios.get(
        `${this.notificationServiceBaseUrl}/event-subscribers/by-email-and-type?email=${encodeURIComponent(
          email
        )}&eventType=${encodeURIComponent(eventType)}`,
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid email or eventType parameters.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            return null;
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during event subscriber retrieval.');
      }
    }
  }

  /**
   * Deletes an event subscriber by email and event type.
   * @param email - The subscriber email.
   * @param eventType - The event type (e.g., "DEMO_DAY").
   * @returns A Promise that resolves when the subscriber is deleted.
   */
  async deleteEventSubscriberByEmailAndType(email: string, eventType: string) {
    try {
      await axios.delete(
        `${this.notificationServiceBaseUrl}/event-subscribers/by-email-and-type?email=${encodeURIComponent(
          email
        )}&eventType=${encodeURIComponent(eventType)}`,
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid email or eventType parameters.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            return;
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during event subscriber deletion.');
      }
    }
  }

  /**
   * Lists event subscribers with optional filters.
   * @param filters - Optional filters (eventType, search, skip, take).
   * @returns A Promise that resolves to an array of event subscribers.
   */
  async listEventSubscribers(filters?: { eventType?: string; search?: string; skip?: number; take?: number }) {
    try {
      const params = new URLSearchParams();
      if (filters?.eventType) params.append('eventType', filters.eventType);
      if (filters?.search) params.append('search', filters.search);
      if (filters?.skip !== undefined) params.append('skip', filters.skip.toString());
      if (filters?.take !== undefined) params.append('take', filters.take.toString());

      const response = await axios.get(
        `${this.notificationServiceBaseUrl}/event-subscribers${params.toString() ? `?${params.toString()}` : ''}`,
        {
          headers: {
            Authorization: `Basic ${this.notificationServiceSecret}`,
          },
        }
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid filter parameters.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during event subscribers listing.');
      }
    }
  }

  /**
   * Gets all notification settings.
   * @returns A Promise that resolves to all notification settings.
   */
  async getAllNotificationSettings() {
    try {
      const response = await axios.get(`${this.notificationServiceBaseUrl}/notification-settings`, {
        headers: {
          Authorization: `Basic ${this.notificationServiceSecret}`,
        },
      });
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        switch (error.response?.status) {
          case 400:
            throw new BadRequestException('Invalid request parameters.');
          case 401:
            throw new UnauthorizedException('Authentication failed. Check API keys or tokens.');
          case 404:
            throw new NotFoundException('Notification settings endpoint not found.');
          case 500:
            throw new InternalServerErrorException('Internal server error. Retry later.');
          default:
            throw new HttpException(
              `Unhandled error with status ${error.response?.status || 'unknown'}.`,
              error.response?.status || 500
            );
        }
      } else {
        throw new InternalServerErrorException('Unexpected error during notification settings retrieval.');
      }
    }
  }
}

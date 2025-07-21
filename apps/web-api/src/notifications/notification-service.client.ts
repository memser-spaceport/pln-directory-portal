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
}

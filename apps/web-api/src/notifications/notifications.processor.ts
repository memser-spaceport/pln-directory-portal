import axios from 'axios';
import { isEmpty } from 'lodash';
import { Process, Processor } from '@nestjs/bull';
import { NotificationService } from './notifications.service';
import { LogService } from '../shared/log.service';
import { MemberSubscriptionService } from '../member-subscriptions/member-subscriptions.service';
import { NotificationStatus, Prisma } from '@prisma/client';
import { EMAIL_TEMPLATES, NOTIFICATION_CHANNEL } from '../utils/constants';
import { ConflictException, BadRequestException, NotFoundException, HttpException, InternalServerErrorException, UnauthorizedException } from '@nestjs/common';

@Processor('notifications')
export class NotificationConsumer {
  private notificationServiceBaseUrl: string = "";
  private notificationServiceSecret: string = "";
  private createdNotification;
  constructor(
    private logger: LogService,
    private notificationService: NotificationService,
    private memberSubscriptionService: MemberSubscriptionService,
  ) {
    this.notificationServiceBaseUrl = process.env.NOTIFICATION_SERVICE_BASE_URL as string;
    this.notificationServiceSecret = process.env.NOTIFICATION_SERVICE_CLIENT_SECRET as string;
    if (!this.notificationServiceBaseUrl) {
      this.logger.error('NOTIFICATION_SERVICE_BASE_URL is not defined in the environment variables.');
      return;
    }
    if (!this.notificationServiceSecret) {
      this.logger.error('NOTIFICATION_SERVICE_CLIENT_SECRET is not defined in the environment variables.');
      return;
    }
  }

  /**
   * Processes a notification job and handles its lifecycle.
   * @param job - The job object from the Bull queue, containing data for the notification to be processed.
   * @returns A Promise that resolves when the notification is processed successfully.
   * @throws Updates the notification status to FAILED if an error occurs.
   */
  @Process({
    name: 'notify',
    concurrency: 1 // Ensures only one job is processed at a time
  })
  async process(job) {
    try {
      this.logger.info(`Processing notification with id: ${job.id}`);
      if (job.name === 'notify') {
        const notificationData = job.data;
        const subscribers: any[] = await this.getSubscribers(notificationData.entityType, notificationData.
          entityUid) || [];
        if (isEmpty(subscribers)) {
          this.logger.info(`No susbscribers found for the provided entity uid ${notificationData.entityUid}`);
          return;
        }
        this.createdNotification = await this.notificationService.createNotification(notificationData);
        switch (notificationData.entityType) {
          case "EVENT_LOCATION":
            await this.sendEventLocationNotification(subscribers, notificationData);
        }
        await this.notificationService.updateNotificationStatus(this.createdNotification.uid, NotificationStatus.SENT);
      }
      this.logger.info(`Processing ended for id: ${job.id}`);
    } catch (error) {
      this.logger.error(`Error occured while sending notification`, error);
      this.handleErrors(error);
    }
    return;
  }

  /**
   * Retrieves a list of subscribers for a given entity type and UID.
   * @param entityType - The type of the entity (e.g., EVENT, USER).
   * @param entityUid - The unique identifier of the entity.
   * @returns A Promise that resolves to an array of subscribers, including their details.
   */
  private async getSubscribers(entityType, entityUid) {
    try {
     return await this.memberSubscriptionService.getSubscriptions({
        where: {
          AND: {
            entityType: entityType,
            entityUid: entityUid,
            isActive: true
          }
        },
        include: {
          member: {
            select: {
              email: true,
            }
          }
        }
      });

    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
   * Constructs the base email notification payload for a given notification and subscriber.
   * @param notificationData - The data related to the notification, including entity type, action type, and additional information.
   * @param subscriber - The subscriber details, including their member information.
   * @returns A Promise that resolves to the constructed base notification payload.
   */
  private buildEmailNotificationPayload(notificationData) {
    try {
      return {
        isPriority: true,
        deliveryChannel: NOTIFICATION_CHANNEL.EMAIL,
        templateName: "",
        recipientsInfo: {},
        deliveryPayload: {
          body: {}
        },
        entityType: notificationData.entityType,
        actionType: notificationData.actionType,
        targetReasonType: "",
        sourceMeta: {
          activityId: notificationData.entityUid,
          activityType: notificationData.entityType,
          activityUserId: notificationData.additionalInfo.sourceUid,
          activityUserName: notificationData.additionalInfo.sourceName
        },
        targetMeta: {
          emailId: "",
          userId: "",
          userName: "",
        }
      }
    } catch (error) {
      this.handleErrors(error)
    }
  }

  /**
   * Sends email notifications to subscribers regarding updates in a location.
   *
   * @param subscribers - An array of subscriber objects who need to be notified.
   * @param notificationData - The data containing details about the event location notification.
   * @returns A promise that resolves when all notifications have been sent.
   */
  private async sendEventLocationNotification(subscribers, notificationData) {
    try {
      let payload = this.buildEmailNotificationPayload(notificationData);
      payload = await this.generateActionSpecificEmailPayload(payload, notificationData);
      await this.addEmailRecipients(payload, subscribers);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Generates an action-specific email payload based on the notification's action type.
   * @param message - The base email notification message payload.
   * @param notificationData - The data related to the notification, including action type and additional info.
   * @param subscriber - The subscriber details, including member information.
   * @returns The complete email payload tailored for the specific action type.
   */
  private async generateActionSpecificEmailPayload(message, notificationData) {
    switch (notificationData.entityAction) {
      case "IRL_UPDATE":
        return await this.generateEmailPayloadForIRLUpdates(message, notificationData);
      default:
        return null;
    }
  }

  /**
   * Generates an action-specific email payload based on the notification's action type.
   * @param message - The base email notification message payload.
   * @param notificationData - The data related to the notification, including action type and additional info.
   * @param subscriber - The subscriber details, including member information.
   * @returns The complete email payload tailored for the specific action type.
   */
  private async generateEmailPayloadForIRLUpdates(message, notificationData) {
    message.templateName = EMAIL_TEMPLATES.IRL_UPDATES;
    message.actionType = notificationData.entityAction;
    message.deliveryPayload.body = {
      location: notificationData.additionalInfo.location,
      rsvpLink: notificationData.additionalInfo.rsvpLink,
      irlPageLink: notificationData.additionalInfo.irlPageLink,
      speakers: notificationData.additionalInfo.speakers,
      hosts: notificationData.additionalInfo.hosts,
      events: notificationData.additionalInfo.events,
      guestBaseUrl: notificationData.additionalInfo.guestBaseUrl,
      irlBaseUrl: notificationData.additionalInfo.irlBaseUrl,
      hostCount: notificationData.additionalInfo.hostCount,
      speakerCount: notificationData.additionalInfo.speakerCount,
      eventCount: notificationData.additionalInfo.eventCount,
    };
    return message;
  }

  /**
   * adds subscriber email addresses in bcc.
   * @param emailPayload  The base email notification message payload.
   * @param subscribers The subscriber details, including member information.
   * @returns The complete email payload tailored for the specific action type.
   */
  private async addEmailRecipients(emailPayload, subscribers) {
    try {
      const subscriberEmails = subscribers.flatMap(subscriber => [subscriber.member.email]).filter(email => email != null);
      const batchSize = Number(process.env.IRL_NOTIFICATION_BATCH_SIZE) || 50;
      for (let i = 0; i < subscriberEmails.length; i += batchSize) {
        const emailBatch = subscriberEmails.slice(i, i + batchSize);
        const batchPayload = { ...emailPayload };         // Create a copy of the original payload for each batch
        batchPayload.recipientsInfo.bcc = emailBatch;          // Add the batch of emails to the BCC field
        if (batchPayload && emailBatch.length <= (Number(process.env.IRL_NOTIFICATION_BATCH_SIZE) || 50)) {
          await this.sendNotification(batchPayload);     // Send the notification for this batch
        }
      }

    } catch (error) {
      this.handleErrors(error)
    }

  }

  /**
   * Sends a notification using the specified payload.
   * Handles potential errors during the API request and updates notification status as FAILED.
   *
   * @param payload - The data to send with the notification request.
   * @returns A Promise that resolves to the response from the API, or throws an error if the request fails.
   */
  async sendNotification(payload) {
    try {
      return await axios.post(
        `${this.notificationServiceBaseUrl}/notifications`,
        payload,
        {
          headers: {
            'Authorization': `Basic ${this.notificationServiceSecret}`
          }
        }
      );
    } catch (error) {
      await this.notificationService.updateNotificationStatus(this.createdNotification.uid, NotificationStatus.FAILED)
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
   * Handles errors occurring during database operations.
   * Logs the error and rethrows it with a more specific exception if applicable.
   * @param error - The error object thrown by Prisma.
   * @param message - An optional message providing additional context, such as the uid causing the error.
   * @throws ConflictException, BadRequestException, NotFoundException, or the original error.
   */
  private handleErrors(error: any, message?: string) {
    this.notificationService.updateNotificationStatus(this.createdNotification.uid, NotificationStatus.FAILED)
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2002': // Unique constraint violation
          throw new ConflictException('Unique key constraint error on notification:', error.message);
        case 'P2003': // Foreign key constraint violation
          throw new BadRequestException('Foreign key constraint error on notification:', error.message);
        case 'P2025': // Record not found
          throw new NotFoundException('Notification not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database validation error on notification:', error.message);
    }
  }
  private async delay(ms: number) {
    this.logger.info(`Processing underway `)
    return new Promise(resolve => setTimeout(resolve, ms));
  }

}

import { Process, Processor } from '@nestjs/bull';
import { NotificationService } from './notifications.service';
import { LogService } from '../shared/log.service';
import { MemberSubscriptionService } from '../member-subscriptions/member-subscriptions.service';
import axios from 'axios';
import { NotificationStatus, Prisma } from '@prisma/client';
import { PLEventGuestsService } from '../pl-events/pl-event-guests.service';
import { DeliveryChannel, EmailTemplate } from '../utils/constants';
import { ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';

@Processor('notifications')
export class NotificationConsumer {
  private baseUrl: string = "";
  constructor(
    private readonly notificationService: NotificationService,
    private logger: LogService,
    private memberSubscriptionService: MemberSubscriptionService,
    private eventGuestService: PLEventGuestsService,
  ) {
    this.baseUrl = process.env.EMAIL_NOTIFICATION_BASE_URL as string;
    if (!this.baseUrl) {
      this.logger.error('EMAIL_NOTIFICATION_BASE_URL is not defined in the environment variables.');
      return;
    }
  }

  /**
   * Processes a notification job and handles its lifecycle.
   * @param job - The job object from the Bull queue, containing data for the notification to be processed.
   * @returns A Promise that resolves when the notification is processed successfully.
   * @throws Updates the notification status to FAILED if an error occurs.
   */
  @Process('notify')
  async process(job) {
    let createdNotification;
    try {
      this.logger.info(`Processing notification with id: ${job.id}`);
      if (job.name === 'notify') {
        const { notificationData } = job;
        createdNotification = await this.notificationService.createNotification(notificationData);
        const subscribers: any[] = await this.getSubscribers(notificationData.entityType, notificationData.entityUid) || [];
        switch (notificationData.entityType) {
          case "EVENT_LOCATION":
            await this.sendEventLocationNotification(subscribers, notificationData);
        }
        await this.notificationService.updateNotificationStatus(createdNotification.uid, NotificationStatus.SENT)
      }
      return;
    } catch (error) {
      await this.notificationService.updateNotificationStatus(createdNotification.uid, NotificationStatus.FAILED)
      this.logger.error(`Error occured while sending notification`, error);
      this.handleErrors(error);
    }
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
            entityUid: entityUid
          }
        },
        include: {
          member: {
            select: {
              name: true,
              email: true,
              telegramHandler: true
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
  private async buildEmailNotificationPayload(notificationData, subscriber) {
    return {
      isPriority: true,
      delivery: {
        deliveryChannel: DeliveryChannel,
        templateName: "",
        payload: {
          body: {}
        }
      },
      entityType: notificationData.entityType,
      actionType: notificationData.actionType,
      targetReasonType: "",
      source: {
        activityId: "ACT12345",
        activityType: notificationData.entityType,
        activityUserId: notificationData.additionalInfo.sourceUid,
        activityUserName: notificationData.additionalInfo.sourceName
      },
      target: {
        emailId: subscriber.member.email,
        userId: subscriber.memberUid,
        userName: subscriber.member.name,
      },
      clientId: process.env.EMAIL_NOTIFICATION_CLIENT_ID
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
    return await subscribers?.map(subscriber => {
      const message = this.buildEmailNotificationPayload(notificationData, subscriber);
      axios.post(
        this.baseUrl,
        this.generateActionSpecificEmailPayload(message, notificationData, subscriber)
      );
    });
  }

  /**
   * Generates an action-specific email payload based on the notification's action type.
   * @param message - The base email notification message payload.
   * @param notificationData - The data related to the notification, including action type and additional info.
   * @param subscriber - The subscriber details, including member information.
   * @returns The complete email payload tailored for the specific action type.
   */
  private generateActionSpecificEmailPayload(message, notificationData, subscriber) {
    switch (notificationData.actionType) {
      case "EVENT_ADDED":
        return this.generateEmailPayloadForEventAddition(message, notificationData, subscriber);
      case "HOST_SPEAKER_ADDED":
        return this.generateEmailPayloadForHostAndSpeakerAddition(message, notificationData.additionalInfo, subscriber);
    }
  }

  /**
   * Generates the email payload for the "EVENT_ADDED" action.
   * @param message - The base email notification message payload.
   * @param eventData - Data related to the event, including name and start date.
   * @param subscriber - The subscriber details, including member information.
   * @returns The complete email payload for the event addition action.
   */
  private generateEmailPayloadForEventAddition(message, eventData, subscriber) {
    message.delivery.templateName = EmailTemplate.EVENT_ADDED
    message.delivery.payload.body = {
      subject: "New Event added",
      greeting: `Hello ${subscriber.member.name},`,
      message: `A new event is been added named ${eventData.additionalInfo.eventName} added in ${location} starting on ${eventData.additionalInfo.startDate}`,
      footer: "If you did not make this change, please contact us immediately."
    };
    return message;
  }

  /**
   * Generates the email payload for the "HOST_SPEAKER_ADDED" action.
   * @param message - The base email notification message payload.
   * @param guestData - Data related to the host or speaker, including their unique identifier and event details.
   * @param subscriber - The subscriber details, including member information.
   * @returns A Promise that resolves to the complete email payload for the host or speaker addition action.
   */
  private async generateEmailPayloadForHostAndSpeakerAddition(message, guestData, subscriber) {
    const guest = await this.eventGuestService.getHostAndSpeakerDetailsByUid(guestData.memberUid, guestData.eventUid)
    message.delivery.templateName = EmailTemplate.HOST_SPEAKER_ADDED
    message.delivery.payload.body = {
      subject: "New Host/Speaker onboarded",
      greeting: `Hello ${subscriber.member.name},`,
      message: `New Host has onboarded. ${guest?.member.name} has been joined as host for the event ${guest?.event.name}`,
      footer: "If you did not make this change, please contact us immediately."
    };
    return message;
  }

  /**
   * Handles errors occurring during database operations.
   * Logs the error and rethrows it with a more specific exception if applicable.
   * @param error - The error object thrown by Prisma.
   * @param message - An optional message providing additional context, such as the uid causing the error.
   * @throws ConflictException, BadRequestException, NotFoundException, or the original error.
   */
  private handleErrors(error: any, message?: string) {
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
    throw error;
  }

}

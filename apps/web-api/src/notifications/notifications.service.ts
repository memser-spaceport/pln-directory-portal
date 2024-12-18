import { Injectable, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('notifications') private notificationQ: Queue
) {}

  /**
   * Creates a new notification record in the database.
   * @param notification - The data for the notification to be created, adhering to Prisma's `NotificationUncheckedCreateInput`.
   * @returns The created notification record.
   * @throws ConflictException if a unique constraint is violated.
   * @throws BadRequestException if a validation error occurs.
   */
  async createNotification(notification: Prisma.NotificationUncheckedCreateInput) {
    try {
      return await this.prisma.notification.create({
        data: {
          ...notification
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Updates a notification record in the database by its unique identifier (uid).
   * @param uid - The unique identifier of the notification record to update.
   * @param notification - The fields to update in the notification record.
   * @returns The updated notification record.
   * @throws NotFoundException if no notification record is found with the provided uid.
   */
  async modifyNotification(uid: string, notification: Prisma.NotificationUncheckedUpdateInput) {
    try {
      return await this.prisma.notification.update({
        where: {
          uid,
        },
        data: {
          ...notification
        },
      });
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Retrieves multiple notification records based on the provided query criteria.
   * 
   * This method leverages Prisma's `findMany` to perform a flexible query. 
   * The query object allows the caller to specify filters, sorting, pagination, 
   * and include related entities as needed.
   * 
   * @param query - A `Prisma.NotificationFindManyArgs` object that defines the query criteria.
   *   - `where`: Conditions to filter the records (e.g., by `entityType` or `status`).
   *   - `orderBy`: Sorting criteria for the results (e.g., by `createdAt` in ascending order).
   *   - `skip`: The number of records to skip for pagination.
   *   - `take`: The number of records to retrieve (limit for pagination).
   * 
   * @returns An array of notification records matching the query criteria.
   */
  async getNotifications(query: Prisma.NotificationFindManyArgs) {
    try {
      return await this.prisma.notification.findMany(query);
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Adds a notification job to the queue for processing.
   * 
   * @param notification - The notification data to be added to the queue.
   * @returns The created job instance or `null` if an error occurs.
   * @throws An exception if adding the notification job fails.
   */
  async sendNotification(notification: Prisma.NotificationUncheckedCreateInput) {
    this.logger.log('Preparing to send notification', JSON.stringify(notification));
    try {
      const job = await this.notificationQ.add('notify', notification, {
        attempts: 3,
        removeOnFail: false
      });
      this.logger.log(`Notification job added to queue with ID: ${job.id}`);
      return job;
    } catch (error) {
      this.logger.error('Failed to add notification to the queue', error.stack);
      return null;
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

import { Injectable, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { CacheService } from '../utils/cache/cache.service';

@Injectable()
export class MemberSubscriptionService {
  private readonly logger = new Logger(MemberSubscriptionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private cacheService: CacheService
  ) { }

  /**
   * Creates a new subscription record in the database.
   * @param subcription - The data for the subscription to be created, adhering to Prisma's `MemberSubscriptionUncheckedCreateInput`.
   * @returns The created subscription record.
   * @throws ConflictException if a unique constraint is violated.
   * @throws BadRequestException if a validation error occurs.
   */
  async createSubscription(subcription: Prisma.MemberSubscriptionUncheckedCreateInput) {
    try {
      const subscriber = await this.prisma.memberSubscription.create({
        data: {
          ...subcription,
        },
      });
      await this.cacheService.reset({ service: 'member-subscription' });
      return subscriber;
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Updates a subscription record in the database by its unique identifier (uid).
   * @param uid - The unique identifier of the subscription record to update.
   * @param subcription - The fields to update in the subscription record.
   * @returns The updated subscription record.
   * @throws NotFoundException if no subscription record is found with the provided uid.
   */
  async modifySubscription(uid: string, subcription: Prisma.MemberSubscriptionUncheckedUpdateInput) {
    try {
      const result = await this.prisma.memberSubscription.update({
        where: {
          uid,
        },
        data: {
          ...subcription
        }
      });
      await this.cacheService.reset({ service: 'member-subscription' });
      return result;
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Retrieves multiple member subscription records based on the provided query criteria.
   * 
   * This method leverages Prisma's `findMany` to perform a flexible query. 
   * The query object allows the caller to specify filters, sorting, pagination, 
   * and include related entities as needed.
   * 
   * @param query - A `Prisma.MemberFollowFindManyArgs` object that defines the query criteria.
   *   - `where`: Conditions to filter the records (e.g., by `memberUid` or `status`).
   *   - `orderBy`: Sorting criteria for the results (e.g., by `createdAt` in ascending order).
   *   - `skip`: The number of records to skip for pagination.
   *   - `take`: The number of records to retrieve (limit for pagination).
   *   - `include`: Related entities to include in the results (e.g., `member`).
   * 
   * @returns An array of member subscription records matching the query criteria.
   * 
   */
  async getSubscriptions(query: Prisma.MemberSubscriptionFindManyArgs) {
    try {
      return await this.prisma.memberSubscription.findMany(query);
    } catch (error) {
      this.handleErrors(error);
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
          throw new ConflictException('Unique key constraint error on subscription:', error.message);
        case 'P2003': // Foreign key constraint violation
          throw new BadRequestException('Foreign key constraint error on subscription:', error.message);
        case 'P2025': // Record not found
          throw new NotFoundException('Subscription not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database validation error on follow:', error.message);
    }
    throw error;
  }
}

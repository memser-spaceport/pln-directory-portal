import { Injectable, ConflictException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class MemberFollowsService {
  private readonly logger = new Logger(MemberFollowsService.name);
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new follow record in the database.
   * @param follow - The data for the follow to be created, adhering to Prisma's `MemberFollowUncheckedCreateInput`.
   * @returns The created follow record.
   * @throws ConflictException if a unique constraint is violated.
   * @throws BadRequestException if a validation error occurs.
   */
  async createFollow(follow: Prisma.MemberFollowUncheckedCreateInput) {
    try {
      return await this.prisma.memberFollow.create({
        data: {
          ...follow,
        },
      });
    } catch (error) {
      this.handleErrors(error);
    }
  }

  /**
   * Deletes a follow record from the database by its unique identifier (uid).
   * @param uid - The unique identifier of the follow record to delete.
   * @returns The deleted follow record.
   * @throws NotFoundException if no follow record is found with the provided uid.
   */
  async deleteFollowByUid(uid: string) {
    try {
      return await this.prisma.memberFollow.delete({
        where: {
          uid,
        },
      });
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Retrieves multiple member follow records based on the provided query criteria.
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
   *   - `include`: Related entities to include in the results (e.g., `member` or `followedEntity`).
   * 
   * @returns An array of member follow records matching the query criteria.
   * 
   */
  async getFollows(query: Prisma.MemberFollowFindManyArgs) {
    try {
      return await this.prisma.memberFollow.findMany(query);
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
          throw new ConflictException('Unique key constraint error on follow:', error.message);
        case 'P2003': // Foreign key constraint violation
          throw new BadRequestException('Foreign key constraint error on follow:', error.message);
        case 'P2025': // Record not found
          throw new NotFoundException('Follow not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database validation error on follow:', error.message);
    }
    throw error;
  }
}

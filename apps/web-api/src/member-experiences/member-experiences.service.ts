import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ConflictException
} from '@nestjs/common';
import { Prisma, MemberExperience } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { 
  CreateMemberExperienceDto, 
  UpdateMemberExperienceDto 
} from '../../../../libs/contracts/src/schema/member-experience';

@Injectable()
export class MemberExperiencesService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService
  ) { }

  /**
   * Creates a new member experience in the database.
   * 
   * @param dto - The data transfer object for the new member experience
   * @returns The created member experience record
   */
  async create(experienceDto: CreateMemberExperienceDto) {
    try {
      const { memberUid, ...data } = experienceDto;
      return await this.prisma.memberExperience.create({
        data: {
          ...data,
          member: {
            connect: { uid: memberUid }
          }
        }
      });
    } catch (error) {
      this.logger.error('Error creating member experience', error);
      this.handleErrors(error);
    }
  }

  /**
   * Retrieves a single member experience by its UID.
   * 
   * @param uid - The UID of the member experience to retrieve
   * @param options - Additional query options
   * @returns The requested member experience record
   */
  async findOne(uid: string, options?: Omit<Prisma.MemberExperienceFindUniqueArgs, 'where'>) {
    try {
      const experience = await this.prisma.memberExperience.findUnique({
        ...options,
        where: { uid }
      });

      if (!experience) {
        throw new NotFoundException(`Member experience with UID ${uid} not found`);
      }

      return experience;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.handleErrors(error, uid);
    }
  }

  /**
   * Updates a member experience by its UID.
   * 
   * @param uid - The UID of the member experience to update
   * @param dto - The data transfer object with fields to update
   * @returns The updated member experience record
   */
  async update(uid: string, updateMemberExperiencedto: UpdateMemberExperienceDto) {
    try {
      const { memberUid, ...experienceData } = updateMemberExperiencedto;
      
      const updateData: Prisma.MemberExperienceUpdateInput = {
        ...experienceData,
        userUpdatedAt: new Date()
      };
      
      return await this.prisma.memberExperience.update({
        where: { uid },
        data: updateData
      });
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

 /**
   * Removes a member experience by its UID.
   * 
   * @param uid - The UID of the member experience to remove
   * @returns The deleted member experience record
   */ 
  async remove(uid: string) {
    try {
      return await this.prisma.memberExperience.delete({
        where: { uid }
      });
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Handles errors occurring during database operations.
   * Logs the error and rethrows it with a more specific exception if applicable.
   * @param error - The error object thrown by Prisma.
   * @param message - An optional message providing additional context, such as the uid causing the error.
   * @throws NotFoundException, BadRequestException, or the original error.
   */
  private handleErrors(error: any, uid?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error.code) {
        case 'P2025':
          throw new NotFoundException('Member experience not found with uid: ' + uid);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Member Experience', error.message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database validation error on member experience: ' + error.message);
    }
    throw error;
  }
}
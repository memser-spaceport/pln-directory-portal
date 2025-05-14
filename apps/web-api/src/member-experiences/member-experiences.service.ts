import {
  BadRequestException,
  Injectable,
  NotFoundException,
  forwardRef,
  Inject
} from '@nestjs/common';
import { Prisma, MemberExperience } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { 
  CreateMemberExperienceDto, 
  UpdateMemberExperienceDto 
} from '../../../../libs/contracts/src/schema/member-experience';
import { ParticipantsRequestService } from '../participants-request/participants-request.service';
import { CacheService } from '../utils/cache/cache.service';

@Injectable()
export class MemberExperiencesService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    @Inject(forwardRef(() => ParticipantsRequestService))
    private participantsRequestService: ParticipantsRequestService,
    private cacheService: CacheService
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
      const experience = await this.prisma.memberExperience.create({
        data: {
          ...data,
          member: {
            connect: { uid: memberUid }
          }
        }
      });
      await this.cacheService.reset({ service: 'members' });
      return experience;
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
  async update(uid: string, updateMemberExperiencedto: UpdateMemberExperienceDto, requesterEmailId: string) {
    try {
      const existingExperience = await this.findOne(uid);
      const { memberUid, ...experienceData } = updateMemberExperiencedto;
      
      const updateData: Prisma.MemberExperienceUpdateInput = {
        ...experienceData,
        userUpdatedAt: new Date()
      };
      
      const experience = await this.prisma.$transaction(async (tx) => {
        const updatedExperience = await tx.memberExperience.update({
          where: { uid },
          data: updateData
        });

        //logging into participant request
        await this.participantsRequestService.add(
          {
            status: 'AUTOAPPROVED',
            requesterEmailId,
            referenceUid: uid,
            uniqueIdentifier: updatedExperience.title,
            participantType: 'MEMBER',
            newData: updatedExperience as any,
            oldData: existingExperience as any,
          },
          tx
        );

        return updatedExperience;
      });
      await this.cacheService.reset({ service: 'members' });
      return experience;
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
      const experience = await this.prisma.memberExperience.delete({
        where: { uid }
      });
      await this.cacheService.reset({ service: 'members' });
      return experience;
    } catch (error) {
      this.handleErrors(error, uid);
    }
  }

  /**
   * Retrieves all member experiences for a specific member,
   * sorted with current positions first, then by end date (most recent first).
   * 
   * @param uid - The UID of the member to retrieve experiences for
   * @returns An array of member experiences
   */
  async getAllMemberExperience(uid: string) {
    try {
      const experiences = await this.prisma.memberExperience.findMany({
        include: {
          member: true
        },
        where: {
          member: {
            uid: uid
          }
        },
        orderBy: [
          { isCurrent: 'desc' },
          { endDate: 'desc' },
          { startDate: 'desc' }
        ]
      });
      return experiences;
    } catch (error) {
      this.handleErrors(error);
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
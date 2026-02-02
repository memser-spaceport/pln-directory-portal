import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { PLEventAssociation, Prisma, AssociationRole, AssociationEntityType } from '@prisma/client';

/**
 * Service for managing event associations (host/co-host/speaker/sponsor relationships).
 * These associations link members/teams to events.
 */
@Injectable()
export class PLEventAssociationService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
  ) {}

  /**
   * Upserts an event association using external IDs as the unique key.
   * 
   * @param externalEventId - External event ID from events-service
   * @param externalAssociationId - External association ID from events-service
   * @param createData - Data for creating a new association
   * @param updateData - Data for updating an existing association
   * @param tx - Optional transaction client
   * @returns The upserted association
   */
  async upsertByExternalIds(
    externalEventId: string,
    externalAssociationId: string,
    createData: Prisma.PLEventAssociationUncheckedCreateInput,
    updateData: Prisma.PLEventAssociationUncheckedUpdateInput,
    tx?: Prisma.TransactionClient
  ): Promise<PLEventAssociation> {
    try {
      const association = await (tx || this.prisma).pLEventAssociation.upsert({
        where: {
          externalEventId_externalAssociationId: {
            externalEventId,
            externalAssociationId,
          },
        },
        create: createData,
        update: updateData,
      });
      this.logger.info(
        `Upserted event association for externalAssociationId: ${externalAssociationId}`,
        'PLEventAssociationService'
      );
      return association;
    } catch (error) {
      this.logger.error(`Error upserting event association: ${error.message}`, error.stack, 'PLEventAssociationService');
      this.handleErrors(error);
    }
  }

  /**
   * Deletes multiple event associations matching query criteria.
   * 
   * @param where - Prisma where clause
   * @param tx - Optional transaction client
   * @returns Count of deleted associations
   */
  async deleteMany(
    where: Prisma.PLEventAssociationWhereInput,
    tx?: Prisma.TransactionClient
  ): Promise<{ count: number }> {
    try {
      const result = await (tx || this.prisma).pLEventAssociation.deleteMany({ where });
      this.logger.info(`Deleted ${result.count} event associations`, 'PLEventAssociationService');
      return result;
    } catch (error) {
      this.logger.error(`Error deleting event associations: ${error.message}`, error.stack, 'PLEventAssociationService');
      this.handleErrors(error);
    }
  }

  /**
   * Maps role from events-service to Prisma enum.
   * 
   * @param role - Role string from events-service
   * @returns AssociationRole enum value
   */
  mapRole(role: 'HOST' | 'CO_HOST' | 'SPEAKER' | 'SPONSOR' | 'ATTENDEE'): AssociationRole {
    return AssociationRole[role];
  }

  /**
   * Maps entity type from events-service to Prisma enum.
   * 
   * @param entityType - Entity type string from events-service
   * @returns AssociationEntityType enum value
   */
  mapEntityType(entityType: 'MEMBER' | 'TEAM'): AssociationEntityType {
    return entityType === 'MEMBER' ? AssociationEntityType.MEMBER : AssociationEntityType.TEAM;
  }

  /**
   * Handles Prisma errors and throws appropriate HTTP exceptions.
   * 
   * @param error - The error to handle
   * @param message - Optional context message
   */
  private handleErrors(error: any, message?: string): never {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          const fieldName = (error.meta as any)?.target?.[0] || 'field';
          throw new ConflictException(`This ${fieldName} is already in the system.`);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Event Association', error.message);
        case 'P2025':
          throw new NotFoundException('Event Association not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Event Association', error.message);
    } else {
      throw error;
    }
  }
}


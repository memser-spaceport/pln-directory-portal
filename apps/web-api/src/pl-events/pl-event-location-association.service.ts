import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { PLEventLocationAssociation, Prisma } from '@prisma/client';
import { CacheService } from '../utils/cache/cache.service';

/**
 * Service for managing location associations between events and locations.
 * This service is responsible for creating and fetching location associations.
 */
@Injectable()
export class PLEventLocationAssociationService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
    private cacheService: CacheService,
  ) {}

  /**
   * Fetch location associations by location criteria array.
   * Each location object can have city, state, country fields (all optional).
   * Builds dynamic query based on available fields for each location.
   * @param locationCriteria - Array of location objects with optional city, state, country fields
   * @returns Promise<any[]> - Array of location associations with inferred location data
   */
  async fetchAssociationsByLocationCriteria(
    locationCriteria: Array<{ city?: string; state?: string; country?: string }>
  ): Promise<PLEventLocationAssociation[]> {
    try {
      this.logger.info(`Fetching associations for ${locationCriteria?.length} location criteria`, 'PLEventLocationAssociationService');
      
      if (!locationCriteria || locationCriteria.length === 0) {
        return [];
      }

      // Build the dynamic WHERE clause for multiple location criteria
      const { whereClause, parameters } = this.buildLocationCriteriaWhereClause(locationCriteria);
      return await this.prisma.$queryRawUnsafe(
        `
        SELECT
          a."locationName"   AS location,     -- Location name from association table (input location)
          a."locationUid"    AS "inferredLocationUid", -- UID linking to PLEventLocation table
          l."location"       AS "inferredLocation",      -- Actual location name from PLEventLocation table (joined data)
          a."city",         
          a."state",         
          a."country",      
          a."region"    
        FROM "PLEventLocationAssociation" a   -- Main table: event location associations (aliased as 'a')
        JOIN "PLEventLocation" l ON l."uid" = a."locationUid" -- Join with location table to get inferred location data
        WHERE a."isDeleted" = false           -- Only include active (non-deleted) associations
          AND (${whereClause})                -- Dynamic conditions for location criteria (OR between locations, AND within each location)
        `,
        ...parameters
      );
    } catch (error) {
      this.logger.error(`Error fetching associations by location criteria: ${error.message}`, error.stack, 'PLEventLocationAssociationService');
      throw error;
    }
  }

  /**
   * Build dynamic WHERE clause for multiple location criteria.
   * Creates OR conditions between different locations and AND conditions within each location.
   * If a field (city/state/country) is not provided, an IS NULL filter is applied for that field.
   */
  private buildLocationCriteriaWhereClause(locationCriteria: Array<{ city?: string; state?: string; country?: string }>): { whereClause: string; parameters: any[] } {
    const locationConditions: string[] = [];
    const parameters: any[] = [];
    let parameterIndex = 1;

    // Process each location criteria
    locationCriteria?.forEach((location) => {
      const fieldConditions: string[] = [];
      // City: use ILIKE when provided, else enforce IS NULL
      if (location.city?.trim()) {
        fieldConditions.push(`a."city" ILIKE $${parameterIndex++}`);
        parameters.push(`%${location.city.trim()}%`);
      } else {
        fieldConditions.push(`a."city" IS NULL`);
      }

      // State: use ILIKE when provided, else enforce IS NULL
      if (location.state?.trim()) {
        fieldConditions.push(`a."state" ILIKE $${parameterIndex++}`);
        parameters.push(`%${location.state.trim()}%`);
      } else {
        fieldConditions.push(`a."state" IS NULL`);
      }

      // Country: use ILIKE when provided, else enforce IS NULL
      if (location.country?.trim()) {
        fieldConditions.push(`a."country" ILIKE $${parameterIndex++}`);
        parameters.push(`%${location.country.trim()}%`);
      } else {
        fieldConditions.push(`a."country" IS NULL`);
      }

      // Always push the grouped conditions for this location (AND within location)
      locationConditions.push(`(${fieldConditions.join(' AND ')})`);
    });

    // If no valid conditions found, return a condition that will match nothing
    if (locationConditions.length === 0) {
      return { whereClause: '1 = 0', parameters: [] };
    }

    // Join all location conditions with OR (match any of the locations)
    const whereClause = locationConditions.join(' OR ');

    return { whereClause, parameters };
  }

  /**
   * Create a new location association record
   * @param data - Object containing location association data
   * @param tx - The transaction object.
   * @returns Promise<PLEventLocationAssociation> - Created association record
   */
  async createLocationAssociation(data: Prisma.PLEventLocationAssociationUncheckedCreateInput, tx?): Promise<PLEventLocationAssociation> {
    try {
      
      // Verify locationUid exists if provided
      if (data.locationUid) {
        const locationExists = await (tx || this.prisma).pLEventLocation.findUnique({
          where: { uid: data.locationUid },
          select: { uid: true }
        });
        if (!locationExists) {
          this.logger.error(`Location with uid ${data.locationUid} does not exist`, 'PLEventLocationAssociationService');
          throw new NotFoundException(`Location with uid ${data.locationUid} does not exist. Cannot create association.`);
        }
        this.logger.info(`Verified location exists: ${data.locationUid}`, 'PLEventLocationAssociationService');
      }
      
      const association = await (tx || this.prisma).pLEventLocationAssociation.create({
        data
      });
      this.logger.info(`Created location association: ${association.uid} with locationUid: ${association.locationUid}`, 'PLEventLocationAssociationService');
      this.cacheService.flushCache();
      return association;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`, error.stack, 'PLEventLocationAssociationService');
      throw error;
    }
  }

  /**
   * Creates a new PLEventLocationAssociation.
   * Public method that includes location relation.
   * 
   * @param data - The location association data to be created.
   * @returns The created location association object with location relation.
   */
  async createPLEventLocationAssociation(data: Prisma.PLEventLocationAssociationUncheckedCreateInput) {
    try {
      const association = await this.prisma.pLEventLocationAssociation.create({
        data,
        include: {
          location: true
        }
      });
      this.logger.info(`Created location association: ${association.uid}`, 'PLEventLocationAssociationService');
      return association;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`);
      this.handleErrors(error);
    }
  }

  /**
   * Find association by query.
   * @param query - Query object.
   * @param tx - The transaction object.
   * @returns Promise<PLEventLocationAssociation> - Found association record
   */
  async findAssociation(query: Prisma.PLEventLocationAssociationFindFirstArgs, tx?) {
    return (tx || this.prisma).pLEventLocationAssociation.findFirst(query);
  }

  /**
   * Update existing matching associations.
   * @param query - Query object.
   * @param tx - The transaction object.
   * @returns Promise<void> - Deleted associations
   */
  async updateAssociations(query: Prisma.PLEventLocationAssociationUpdateManyArgs, tx?) {
    return (tx || this.prisma).pLEventLocationAssociation.updateMany(query);
  }


  /**
   * Retrieves all PLEventLocationAssociations with optional filtering.
   * 
   * @param queryOptions - Optional Prisma query options for filtering and pagination.
   * @returns An array of location associations with location relation.
   */
  async findAllPLEventLocationAssociations(queryOptions?: Prisma.PLEventLocationAssociationFindManyArgs) {
    try {
      const where = {
        ...queryOptions?.where,
        isDeleted: false
      };
      return await this.prisma.pLEventLocationAssociation.findMany({
        ...queryOptions,
        where,
        include: {
          location: true
        }
      });
    } catch (error) {
      this.logger.error(`Error finding all location associations: ${error.message}`);
      this.handleErrors(error);
    }
  }

  /**
   * Retrieves a single PLEventLocationAssociation by UID.
   * 
   * @param uid - The unique identifier of the location association.
   * @returns The location association object with location relation.
   * @throws {NotFoundException} - If the location association is not found.
   */
  async findLocationAssociationByUid(uid: string) {
    try {
      const association = await this.prisma.pLEventLocationAssociation.findFirst({
        where: {
          uid,
          isDeleted: false
        },
        include: {
          location: true
        }
      });
      if (!association) {
        throw new NotFoundException(`Location association with UID ${uid} not found.`);
      }
      return association;
    } catch (error) {
      this.logger.error(`Error finding location association by UID: ${error.message}`);
      this.handleErrors(error);
    }
  }

  /**
   * Updates a PLEventLocationAssociation by UID.
   * If the locationUid is changed, updates all related events' locationUid accordingly.
   * 
   * @param uid - The unique identifier of the location association to update.
   * @param data - The data to update.
   * @returns The updated location association object with location relation.
   * @throws {NotFoundException} - If the location association is not found.
   * @throws {BadRequestException} - If the locationUid doesn't exist.
   */
  async updatePLEventLocationAssociation(uid: string, data, tx?) {
    try {
      // Check if association exists
      const existing = await this.prisma.pLEventLocationAssociation.findFirst({
        where: { uid, isDeleted: false }
      });
      if (!existing) {
        throw new NotFoundException(`Location association with UID ${uid} not found.`);
      }

      // Use transaction to ensure atomicity
      return await this.prisma.$transaction(async (tx) => {
        // Update the association
        const association = await tx.pLEventLocationAssociation.update({
          where: { uid },
          data,
          include: {
            location: true
          }
        });

        // If locationUid changed, update all related events' locationUid
        if (data.locationUid !== undefined && data.locationUid !== existing.locationUid) {
          await this.updateRelatedEventsLocationUid(uid, data.locationUid, tx);
        }
        this.logger.info(`Updated location association: ${association.uid}`);
        this.cacheService.flushCache();
        return association;
      });
    } catch (error) {
      this.logger.error(`Error updating location association: ${error.message}`);
      this.handleErrors(error);
    }
  }

  /**
   * Delete's a PLEventLocationAssociation by UID.
   * 
   * @param uid - The unique identifier of the location association to delete.
   * @returns The deleted location association object with location relation.
   * @throws {NotFoundException} - If the location association is not found.
   */
  async deletePLEventLocationAssociation(uid: string) {
    try {
      // Check if association exists
      const existing = await this.prisma.pLEventLocationAssociation.findFirst({
        where: { uid, isDeleted: false }
      });
      if (!existing) {
        throw new NotFoundException(`Location association with UID ${uid} not found.`);
      }

      const association = await this.prisma.pLEventLocationAssociation.update({
        where: { uid },
        data: { isDeleted: true },
        include: {
          location: true
        }
      });
      this.logger.info(`Deleted location association: ${association.uid}`, 'PLEventLocationAssociationService');
      this.cacheService.flushCache();
      return association;
    } catch (error) {
      this.logger.error(`Error deleting location association: ${error.message}`); 
      this.handleErrors(error);
    }
  }

  /**
   * Updates all related events' locationUid when a location association's locationUid is changed.
   * 
   * @param associationUid - The unique identifier of the location association.
   * @param locationUid - The new locationUid to set on related events.
   * @param tx - The transaction object.
   */
  private async updateRelatedEventsLocationUid(associationUid: string, locationUid: string, tx) {
    await tx.pLEvent.updateMany({
      where: {
        pLEventLocationAssociationUid: associationUid,
        isDeleted: false
      },
      data: {
        locationUid: locationUid
      }
    });
    this.cacheService.flushCache();
  }

  private handleErrors(error, message?: string) {
    this.logger.error(error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      switch (error?.code) {
        case 'P2002':
          const fieldName = (error.meta as any)?.target?.[0] || 'field';
          throw new ConflictException(`This ${fieldName} is already in the system.`);
        case 'P2003':
          throw new BadRequestException('Foreign key constraint error on Location Rule', error.message);
        case 'P2025':
          throw new NotFoundException('Location Rule not found with uid: ' + message);
        default:
          throw error;
      }
    } else if (error instanceof Prisma.PrismaClientValidationError) {
      throw new BadRequestException('Database field validation error on Location Rule', error.message);
    } else {
      throw error;
    }
    return error;
  }
} 

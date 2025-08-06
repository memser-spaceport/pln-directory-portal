import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { PLEventLocationAssociation, Prisma } from '@prisma/client';

/**
 * Service for managing location associations between events and locations.
 * This service is responsible for creating and fetching location associations.
 */
@Injectable()
export class PLEventLocationAssociationService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
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
      const association = await (tx || this.prisma).pLEventLocationAssociation.create({
        data
      });
      this.logger.info(`Created location association: ${association.uid}`, 'PLEventLocationAssociationService');
      return association;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`, error.stack, 'PLEventLocationAssociationService');
      throw error;
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
} 

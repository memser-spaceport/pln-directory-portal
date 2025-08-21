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
   * Find most recent location associations for provided locations.
   * If duplicates exist per location, returns only the most recently created association per location.
   * Done entirely via SQL (no in-memory filtering).
   * @param locations - Array of location names to match against association.locationName
   */
  async fetchRecentAssociationsByLocation(locations: string[]) {
    try {
      if (!locations?.length) {
        return [];
      }
      return await this.prisma.$queryRawUnsafe(
        `
        SELECT DISTINCT ON (a."locationName") -- Return only one row per unique locationName (most recent based on ORDER BY)
          a."locationName"   AS location,     -- Location name from association table (input location)
          a."locationUid"    AS "inferredLocationUid", -- UID linking to PLEventLocation table
          l."location"       AS inferredLocation,      -- Actual location name from PLEventLocation table (joined data)
          a."city",         
          a."state",         
          a."country",      
          a."region"        
        FROM "PLEventLocationAssociation" a   -- Main table: event location associations (aliased as 'a')
        JOIN "PLEventLocation" l ON l."uid" = a."locationUid" -- Join with location table to get inferred location data
        WHERE a."isDeleted" = false           -- Only include active (non-deleted) associations
          AND a."locationName" = ANY ($1)     -- Filter by location names provided in input array
        ORDER BY a."locationName", a."createdAt" DESC -- Group by location name, then order by creation time (newest first)
        `,
        locations
      );
    } catch (error) {
      this.logger.error(`Error finding location association: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Create a new location association record
   * @param data - Object containing location association data
   * @returns Promise<PLEventLocationAssociation> - Created association record
   */
  async createLocationAssociation(data: Prisma.PLEventLocationAssociationUncheckedCreateInput): Promise<PLEventLocationAssociation> {
    try {
      const association = await this.prisma.pLEventLocationAssociation.create({
        data
      });
      this.logger.info(`Created location association: ${association.uid}`, 'PLEventLocationAssociationService');
      return association;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`, error.stack, 'PLEventLocationAssociationService');
      throw error;
    }
  }
} 

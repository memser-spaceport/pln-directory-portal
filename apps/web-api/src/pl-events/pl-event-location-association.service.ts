import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { PLEventLocationAssociation, Prisma } from '@prisma/client';

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
  async fetchAssociationsByLocation(locations: string[]) {
    try {
      if (!locations?.length) {
        return [];
      }
      return await this.prisma.$queryRawUnsafe(
        `
        SELECT DISTINCT ON (a."locationName")
          a."locationName"   AS location,
          a."locationUid"    AS "inferredLocationUid",
          l."location"       AS inferredLocation,
          a."city",
          a."state",
          a."country",
          a."region"
        FROM "PLEventLocationAssociation" a
        JOIN "PLEventLocation" l ON l."uid" = a."locationUid"
        WHERE a."isDeleted" = false
          AND a."locationName" = ANY ($1)
        ORDER BY a."locationName", a."createdAt" DESC
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
        data: {
          locationUid: data.locationUid,
          googlePlaceId: data.googlePlaceId,
          locationName: data.locationName,
          city: data.city,
          state: data.state,
          country: data.country,
          region: data.region,
        },
        include: {
          location: true
        }
      });
      this.logger.info(`Created location association: ${association.uid}`, 'PLEventLocationAssociationService');
      return association;
    } catch (error) {
      this.logger.error(`Error creating location association: ${error.message}`, error.stack, 'PLEventLocationAssociationService');
      throw error;
    }
  }
} 

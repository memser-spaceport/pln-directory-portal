import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';
import { LogService } from '../shared/log.service';
import { PLEventLocationAssociation, Prisma } from '@prisma/client';

export interface LocationMatchCriteria {
  city?: string;
  state?: string;
  country?: string;
  region?: string;
}

type PLEventLocationType = 'CITY' | 'STATE' | 'COUNTRY' | 'REGION';

@Injectable()
export class PLEventLocationAssociationService {
  constructor(
    private prisma: PrismaService,
    private logger: LogService,
  ) {}

  /**
   * Find location association based on provided criteria
   * Builds query dynamically based on which fields are provided
   * @param criteria - Object containing optional city, state, country, region
   * @returns Promise<LocationMatchResult> - Object with found status and association data
   */
  async findLocationAssociation(criteria: LocationMatchCriteria): Promise<PLEventLocationAssociation | null> {
    try {
      const { city, state, country, region } = criteria;
      const queryConditions = this.buildQueryConditions(city, state, country, region);
      if (queryConditions.length === 0) {
        return null;
      }
      return await this.findByDynamicCriteria(queryConditions);
    } catch (error) {
      this.logger.error(`Error finding location association: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Build query conditions array based on provided location fields
   * @param city - Optional city name
   * @param state - Optional state name  
   * @param country - Optional country name
   * @param region - Optional region name
   * @returns Array of Prisma query conditions
   */
  private buildQueryConditions(
    city?: string, 
    state?: string, 
    country?: string, 
    region?: string
  ): any[] {
    const conditions: any[] = [];

    if (city && city.trim()) {
      conditions.push({ city: { equals: city.trim().toLowerCase(), mode: 'insensitive' } });
    }

    if (state && state.trim()) {
      conditions.push({ state: { equals: state.trim().toLowerCase(), mode: 'insensitive' } });
    }

    if (country && country.trim()) {
      conditions.push({ country: { equals: country.trim().toLowerCase(), mode: 'insensitive' } });
    }

    if (region && region.trim()) {
      conditions.push({ region: { equals: region.trim().toLowerCase(), mode: 'insensitive' } });
    }

    return conditions;
  }

  /**
   * Find association using dynamic query conditions
   * @param conditions - Array of Prisma query conditions
   * @returns Promise<any | null> - Association data or null if not found
   */
  private async findByDynamicCriteria(conditions: any[]): Promise<PLEventLocationAssociation | null> {
    return await this.prisma.pLEventLocationAssociation.findFirst({
      where: {
        AND: conditions
      },
      include: {
        location: true
      }
    });
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
          type: data.type
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
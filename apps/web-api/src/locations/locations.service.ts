import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private locationTransferService:LocationTransferService
  ) {}

  findAll(queryOptions: Prisma.LocationFindManyArgs) {
    return this.prisma.location.findMany(queryOptions);
  }

  async validateLocation(location) {
    const { city, country, region } = location;
    if (city || country || region) {
      return await this.locationTransferService.fetchLocation(
        city,
        country,
        null,
        region,
        null
      );
    }
    return null;
  }
}

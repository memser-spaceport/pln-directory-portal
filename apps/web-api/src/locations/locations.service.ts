import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.LocationFindManyArgs) {
    return this.prisma.location.findMany(queryOptions);
  }
}

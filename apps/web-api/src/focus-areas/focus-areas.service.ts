import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FocusAreasService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.FocusAreaFindManyArgs) {
    return this.prisma.focusArea.findMany(queryOptions);
  }
}
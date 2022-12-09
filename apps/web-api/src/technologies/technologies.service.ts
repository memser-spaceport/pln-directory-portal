import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TechnologiesService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.TechnologyFindManyArgs) {
    return this.prisma.technology.findMany(queryOptions);
  }

  findOne(uid: string) {
    return this.prisma.technology.findUniqueOrThrow({ where: { uid } });
  }
}

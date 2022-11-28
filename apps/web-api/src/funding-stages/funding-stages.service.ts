import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class FundingStagesService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.FundingStageFindManyArgs) {
    return this.prisma.fundingStage.findMany(queryOptions);
  }

  findOne(uid: string) {
    return this.prisma.fundingStage.findUniqueOrThrow({ where: { uid } });
  }
}

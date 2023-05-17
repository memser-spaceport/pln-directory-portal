import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class FundingStagesService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.FundingStageFindManyArgs) {
    return this.prisma.fundingStage.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.FundingStageFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.fundingStage.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(fundingStages: string[]) {
    const uniqueFundingStages = Array.from(new Set(fundingStages));
    return await this.prisma.$transaction(
      uniqueFundingStages.map((fundingStage) =>
        this.prisma.fundingStage.upsert({
          where: { title: fundingStage },
          update: {},
          create: {
            title: fundingStage,
          },
        })
      )
    );
  }
}

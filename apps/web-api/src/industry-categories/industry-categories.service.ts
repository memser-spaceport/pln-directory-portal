import { Injectable } from '@nestjs/common';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class IndustryCategoriesService {
  constructor(private prisma: PrismaService) {}

  async insertManyFromList(categories: string[]) {
    const uniqueCategories = Array.from(new Set(categories));
    return await this.prisma.$transaction(
      uniqueCategories.map((category) =>
        this.prisma.industryCategory.upsert({
          where: { title: category },
          update: {},
          create: {
            title: category,
          },
        })
      )
    );
  }
}

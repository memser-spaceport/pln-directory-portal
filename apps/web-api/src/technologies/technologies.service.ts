import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class TechnologiesService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.TechnologyFindManyArgs) {
    return this.prisma.technology.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.TechnologyFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.technology.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(technologies: string[]) {
    const uniqueTechnologies = Array.from(new Set(technologies));
    return await this.prisma.$transaction(
      uniqueTechnologies.map((technology) =>
        this.prisma.technology.upsert({
          where: { title: technology },
          update: {},
          create: {
            title: technology,
          },
        })
      )
    );
  }
}

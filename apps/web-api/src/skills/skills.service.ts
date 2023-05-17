import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.SkillFindManyArgs) {
    return this.prisma.skill.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.SkillFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.skill.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(skills: string[]) {
    const uniqueSkills = Array.from(new Set(skills));
    return await this.prisma.$transaction(
      uniqueSkills.map((skill) =>
        this.prisma.skill.upsert({
          where: { title: skill },
          update: {},
          create: {
            title: skill,
          },
        })
      )
    );
  }
}

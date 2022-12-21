import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

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
}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class TeamsService {
  constructor(private prisma: PrismaService) {}

  async findAll(queryOptions: Prisma.TeamFindManyArgs) {
    return this.prisma.team.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.TeamFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.team.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }
}

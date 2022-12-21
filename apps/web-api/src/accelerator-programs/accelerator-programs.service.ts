import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AcceleratorProgramsService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.AcceleratorProgramFindManyArgs) {
    return this.prisma.acceleratorProgram.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<
      Prisma.AcceleratorProgramFindUniqueArgsBase,
      'where'
    > = {}
  ) {
    return this.prisma.acceleratorProgram.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }
}

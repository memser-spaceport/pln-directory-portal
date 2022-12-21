import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.MemberFindManyArgs) {
    return this.prisma.member.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.MemberFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.member.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }
}

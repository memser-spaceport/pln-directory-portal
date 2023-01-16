import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class MembershipSourcesService {
  constructor(private prisma: PrismaService) {}

  findAll(queryOptions: Prisma.MembershipSourceFindManyArgs) {
    return this.prisma.membershipSource.findMany(queryOptions);
  }

  findOne(
    uid: string,
    queryOptions: Omit<Prisma.MembershipSourceFindUniqueArgsBase, 'where'> = {}
  ) {
    return this.prisma.membershipSource.findUniqueOrThrow({
      where: { uid },
      ...queryOptions,
    });
  }

  async insertManyFromList(membershipSources: string[]) {
    const uniqueMembershipSources = Array.from(new Set(membershipSources));
    return await this.prisma.$transaction(
      uniqueMembershipSources.map((membershipSource) =>
        this.prisma.membershipSource.upsert({
          where: { title: membershipSource },
          update: {},
          create: {
            title: membershipSource,
          },
        })
      )
    );
  }
}

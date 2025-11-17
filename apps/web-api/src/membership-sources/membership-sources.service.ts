import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../shared/prisma.service';
import { TEAM } from '../utils/constants';

@Injectable()
export class MembershipSourcesService {
  constructor(private prisma: PrismaService) {}

  async findAll(query: any) {
    const { type } = query;
    return this.prisma.membershipSource.findMany({
      select: {
        uid: true,
        title: true,
        ...this.buildTeamsFilterByType(type),
      },
      orderBy: {
        title: 'asc',
      },
    });
  }

  private buildTeamsFilterByType(type: any): any {
    if (type === TEAM) {
      return {
        teams: {
          where: {
            accessLevel: {
              not: 'L0',
            },
          },
          select: {
            uid: true,
            name: true,
            logo: {
              select: {
                url: true,
              },
            },
          },
        },
      };
    }
    return {};
  }

  findOne(uid: string, queryOptions: Omit<Prisma.MembershipSourceFindUniqueArgsBase, 'where'> = {}) {
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

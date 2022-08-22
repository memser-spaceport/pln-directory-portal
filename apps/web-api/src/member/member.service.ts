import { Injectable } from '@nestjs/common';
import { Member, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { FetchMembersArgs } from './dto/fetch.members.input';

@Injectable()
export class MemberService {
  constructor(private prisma: PrismaService) {}

  async getCount(): Promise<number> {
    const count = await this.prisma.member.count();
    return count;
  }

  async findOne(
    memberWhereUniqueInput: Prisma.MemberWhereUniqueInput,
  ): Promise<Member | null> {
    return this.prisma.member.findUnique({
      where: memberWhereUniqueInput,
    });
  }

  findAll(args: FetchMembersArgs = { skip: 0, take: 5 }): Promise<Member[]> {
    return this.prisma.member.findMany({ skip: args.skip, take: args.take });
  }

  create(createMemberInput: Prisma.MemberCreateInput) {
    return this.prisma.member.create({
      data: createMemberInput,
    });
  }
}

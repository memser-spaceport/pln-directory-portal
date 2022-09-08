import { Injectable } from '@nestjs/common';
import { Member, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';

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

  findAll(): Promise<Member[]> {
    return this.prisma.member.findMany();
  }

  create(params: {
    name: string;
    email: string;
    image: string | null;
    githubHandler: string | null;
    discordHandler: string | null;
    twitterHandler: string | null;
    officeHours: string | null;
    plnFriend: boolean;
    locationUid: string;
  }) {
    return this.prisma.member.create({
      data: { ...params },
    });
  }
}

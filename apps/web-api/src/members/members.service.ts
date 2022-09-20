import { Injectable } from '@nestjs/common';
import { Member, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { CreateMemberDto } from './dto/create-member.dto';

@Injectable()
export class MembersService {
  constructor(private prisma: PrismaService) {}

  async getCount(): Promise<number> {
    const count = await this.prisma.member.count();
    return count;
  }

  async findOne(
    memberWhereUniqueInput: Prisma.MemberWhereUniqueInput
  ): Promise<Member | null> {
    return this.prisma.member.findUnique({
      where: memberWhereUniqueInput,
    });
  }

  findAll(): Promise<Member[]> {
    return this.prisma.member.findMany();
  }

  create(params: CreateMemberDto) {
    return JSON.parse(
      JSON.stringify(
        this.prisma.member.create({
          data: { ...params },
        })
      )
    );
  }
}

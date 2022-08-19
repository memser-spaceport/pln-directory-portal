import { Injectable } from '@nestjs/common';
import { Member, Prisma } from '@prisma/client';
import { PrismaService } from 'src/prisma.service';
import { CreateMemberInput } from './dto/create-member.input';
import { UpdateMemberInput } from './dto/update-member.input';
import { FetchMembersArgs } from './dto/fetch.members.input';
import { Member as MemberModel } from '@prisma/client';

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
    try {
      return this.prisma.member.findMany({ skip: args.skip, take: args.take });
    } catch (error) {
      console.log(
        '🚀 ~ file: member.service.ts ~ line 30 ~ MemberService ~ findAll ~ error',
        error,
      );
    }
  }

  create(createMemberInput: Prisma.MemberCreateInput) {
    return this.prisma.member.create({
      data: createMemberInput,
    });
  }

  // update(id: number, updateMemberInput: UpdateMemberInput) {
  //   return `This action updates a #${id} member`;
  // }

  // remove(id: number) {
  //   return `This action removes a #${id} member`;
  // }
}

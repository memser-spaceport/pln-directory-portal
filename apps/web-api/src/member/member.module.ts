import { Module } from '@nestjs/common';
import { MemberService } from './member.service';
import { MemberResolver } from './member.resolver';
import { PrismaService } from 'src/prisma.service';

@Module({
  providers: [MemberResolver, MemberService, PrismaService],
})
export class MemberModule {}

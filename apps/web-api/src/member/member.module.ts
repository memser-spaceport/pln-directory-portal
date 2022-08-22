import { Module } from '@nestjs/common';
import { PrismaService } from 'src/prisma.service';
import { MemberResolver } from './member.resolver';
import { MemberService } from './member.service';

@Module({
  providers: [MemberResolver, MemberService, PrismaService],
})
export class MemberModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MemberController } from './member.controller';
import { MemberService } from './member.service';

@Module({
  providers: [MemberService, PrismaService],
  controllers: [MemberController],
})
export class MemberModule {}

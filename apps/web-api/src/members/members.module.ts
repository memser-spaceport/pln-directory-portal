import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  providers: [MembersService, PrismaService],
  controllers: [MemberController],
})
export class MembersModule {}

import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LocationTransferService } from '../utils/location-transfer/location-transfer.service';
import { MemberController } from './members.controller';
import { MembersService } from './members.service';

@Module({
  providers: [MembersService, PrismaService, LocationTransferService],
  controllers: [MemberController],
})
export class MembersModule {}

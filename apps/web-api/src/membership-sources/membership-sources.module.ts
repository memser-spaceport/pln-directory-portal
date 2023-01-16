import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { MembershipSourcesController } from './membership-sources.controller';
import { MembershipSourcesService } from './membership-sources.service';

@Module({
  controllers: [MembershipSourcesController],
  providers: [MembershipSourcesService, PrismaService],
})
export class MembershipSourcesModule {}

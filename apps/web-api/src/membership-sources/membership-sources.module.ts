import { Module } from '@nestjs/common';
import { MembershipSourcesController } from './membership-sources.controller';
import { MembershipSourcesService } from './membership-sources.service';

@Module({
  controllers: [MembershipSourcesController],
  providers: [MembershipSourcesService],
})
export class MembershipSourcesModule {}

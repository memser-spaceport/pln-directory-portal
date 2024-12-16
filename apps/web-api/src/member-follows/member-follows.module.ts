import { Module } from '@nestjs/common';
import { MemberFollowsService } from './member-follows.service';
import { MemberFollowsController } from './member-follows.controller';

@Module({
  controllers: [MemberFollowsController],
  providers: [MemberFollowsService],
  exports: [MemberFollowsService]
})
export class MemberFollowsModule {}
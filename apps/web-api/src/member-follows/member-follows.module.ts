import { Module } from '@nestjs/common';
import { MemberFollowsService } from './member-follows.service';
import { MemberFollowsController } from './member-follows.controller';
import { MembersModule } from '../members/members.module';

@Module({
  controllers: [MemberFollowsController],
  providers: [MemberFollowsService],
  exports: [MemberFollowsService],
  imports:[MembersModule]
})
export class MemberFollowsModule {}
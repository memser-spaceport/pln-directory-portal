import { Module } from '@nestjs/common'
import { MemberFollowUpsService } from './member-follow-ups.service';

@Module({
  imports: [],
  controllers: [],
  providers: [
    MemberFollowUpsService
  ],
  exports: [
    MemberFollowUpsService
  ]
})
export class MemberFollowUpsModule {}
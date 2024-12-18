import { Module } from '@nestjs/common';
import { MemberSubscriptionService } from './member-subscriptions.service';
import { MemberSubscriptionController } from './member-subscriptions.controller';
import { MembersModule } from '../members/members.module';

@Module({
  controllers: [MemberSubscriptionController],
  providers: [MemberSubscriptionService],
  exports: [MemberSubscriptionService],
  imports:[MembersModule]
})
export class MemberSubscriptionsModule {}
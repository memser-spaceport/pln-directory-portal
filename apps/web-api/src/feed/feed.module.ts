import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { FeedController } from './feed.controller';
import { FeedCommentsService } from './feed-comments.service';
import { FeedLikesService } from './feed-likes.service';

@Module({
  imports: [SharedModule, MembersModule, PushNotificationsModule],
  controllers: [FeedController],
  providers: [FeedCommentsService, FeedLikesService],
})
export class FeedModule {}

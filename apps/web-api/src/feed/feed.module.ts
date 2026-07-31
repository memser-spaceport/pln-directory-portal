import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { FeedController } from './feed.controller';
import { FeedCommentsService } from './feed-comments.service';
import { FeedLikesService } from './feed-likes.service';

@Module({
  imports: [SharedModule, MembersModule],
  controllers: [FeedController],
  providers: [FeedCommentsService, FeedLikesService],
})
export class FeedModule {}

import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { ForumModule } from '../forum/forum.module';
import { FeedController } from './feed.controller';
import { FeedForumPostsService } from './feed-forum-posts.service';
import { FeedCommentsService } from './feed-comments.service';
import { FeedLikesService } from './feed-likes.service';

@Module({
  imports: [SharedModule, MembersModule, AccessControlV2Module, ForumModule],
  controllers: [FeedController],
  providers: [FeedForumPostsService, FeedCommentsService, FeedLikesService],
})
export class FeedModule {}

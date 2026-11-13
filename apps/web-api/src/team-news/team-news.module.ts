import { forwardRef, Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { FollowsModule } from '../follows/follows.module';
import { AdminAuthGuard } from '../guards/admin-auth.guard';
import { JwtService } from '../utils/jwt/jwt.service';
import { TeamNewsController } from './team-news.controller';
import { TeamNewsServiceController } from './team-news-service.controller';
import { LabosDigestAdminController } from './labos-digest-admin.controller';
import { LabosDigestServiceController } from './labos-digest-service.controller';
import { LabosDigestService } from './labos-digest.service';
import { TeamNewsService } from './team-news.service';
import { TeamNewsQueryService } from './team-news-query.service';
import { TeamNewsEnrichmentService } from './team-news-enrichment.service';
import { TeamNewsUpvotesService } from './team-news-upvotes.service';
import { TeamNewsSuggestionsService } from './team-news-suggestions.service';
import { TeamNewsTrendingSeedService } from './team-news-trending-seed.service';
import { TeamNewsImpressionsService } from './team-news-impressions.service';
import { TeamNewsPostSummaryService } from './team-news-post-summary.service';
import { TeamNewsImageService } from './team-news-image.service';
import { NewsTagVocabularyService } from './news-tag-vocabulary.service';
import { NewsDefaultTagsService } from './news-default-tags.service';
import { NewsDefaultTagsJob } from './news-default-tags.job';

@Module({
  imports: [
    SharedModule,
    forwardRef(() => MembersModule),
    AccessControlV2Module,
    PushNotificationsModule,
    FollowsModule,
  ],
  controllers: [
    TeamNewsController,
    TeamNewsServiceController,
    LabosDigestAdminController,
    LabosDigestServiceController,
  ],
  providers: [
    AdminAuthGuard,
    JwtService,
    LabosDigestService,
    TeamNewsService,
    TeamNewsQueryService,
    TeamNewsEnrichmentService,
    TeamNewsUpvotesService,
    TeamNewsSuggestionsService,
    TeamNewsTrendingSeedService,
    TeamNewsImpressionsService,
    TeamNewsPostSummaryService,
    TeamNewsImageService,
    NewsTagVocabularyService,
    NewsDefaultTagsService,
    NewsDefaultTagsJob,
  ],
  exports: [
    TeamNewsService,
    TeamNewsQueryService,
    TeamNewsEnrichmentService,
    TeamNewsSuggestionsService,
    TeamNewsUpvotesService,
    LabosDigestService,
  ],
})
export class TeamNewsModule {}

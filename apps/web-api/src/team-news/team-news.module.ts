import { forwardRef, Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { MembersModule } from '../members/members.module';
import { AccessControlV2Module } from '../access-control-v2/access-control-v2.module';
import { PushNotificationsModule } from '../push-notifications/push-notifications.module';
import { TeamNewsController } from './team-news.controller';
import { TeamNewsServiceController } from './team-news-service.controller';
import { TeamNewsService } from './team-news.service';
import { TeamNewsQueryService } from './team-news-query.service';
import { TeamNewsEnrichmentService } from './team-news-enrichment.service';

@Module({
  imports: [SharedModule, forwardRef(() => MembersModule), AccessControlV2Module, PushNotificationsModule],
  controllers: [TeamNewsController, TeamNewsServiceController],
  providers: [TeamNewsService, TeamNewsQueryService, TeamNewsEnrichmentService],
  exports: [TeamNewsService, TeamNewsQueryService, TeamNewsEnrichmentService],
})
export class TeamNewsModule {}

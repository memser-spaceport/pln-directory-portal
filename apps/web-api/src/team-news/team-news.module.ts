import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module';
import { TeamNewsController } from './team-news.controller';
import { TeamNewsServiceController } from './team-news-service.controller';
import { TeamNewsService } from './team-news.service';
import { TeamNewsQueryService } from './team-news-query.service';
import { TeamNewsEnrichmentService } from './team-news-enrichment.service';

@Module({
  imports: [SharedModule],
  controllers: [TeamNewsController, TeamNewsServiceController],
  providers: [TeamNewsService, TeamNewsQueryService, TeamNewsEnrichmentService],
  exports: [TeamNewsService, TeamNewsQueryService, TeamNewsEnrichmentService],
})
export class TeamNewsModule {}

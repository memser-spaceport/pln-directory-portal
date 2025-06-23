import { Module } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { RecommendationsJob } from './recommendations.job';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  providers: [RecommendationsService, RecommendationsJob],
  exports: [RecommendationsService, RecommendationsJob],
})
export class RecommendationsModule {}
